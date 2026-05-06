import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { baselineCases } from './baseline/cases'
import { executeBaselineCase } from './baseline/execute'
import { executeDesktopSmoke } from './desktop-smoke/execute'
import { lanesForMode } from './modes'
import { executeProviderSmoke } from './provider-smoke/execute'
import { writeReport } from './reporter'
import type { LaneDefinition, LaneResult, QualityGateOptions, QualityGateReport } from './types'

type LaneExecutor = (lane: LaneDefinition, options: QualityGateOptions) => Promise<LaneResult>

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function output(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) {
    return null
  }
  return (stdout || stderr).trim()
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function matchesLaneSelector(lane: LaneDefinition, selector: string) {
  const normalized = selector.trim()
  if (!normalized) return false
  if (normalized.endsWith('*')) {
    return lane.id.startsWith(normalized.slice(0, -1))
  }
  return lane.id === normalized
}

function filterLanesForOptions(lanes: LaneDefinition[], options: QualityGateOptions) {
  const only = options.onlyLaneSelectors?.filter(Boolean) ?? []
  const skip = options.skipLaneSelectors?.filter(Boolean) ?? []
  let selected = lanes

  if (only.length > 0) {
    selected = selected.filter((lane) => only.some((selector) => matchesLaneSelector(lane, selector)))
  }
  if (skip.length > 0) {
    selected = selected.filter((lane) => !skip.some((selector) => matchesLaneSelector(lane, selector)))
  }
  if (selected.length === 0) {
    throw new Error(`No quality gate lanes matched selectors. only=${only.join(',') || 'none'} skip=${skip.join(',') || 'none'}`)
  }

  return selected
}

async function pipeToLog(
  stream: ReadableStream<Uint8Array> | null,
  logPath: string,
  write: (chunk: Buffer) => void,
) {
  if (!stream) return
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = Buffer.from(value)
    appendFileSync(logPath, chunk)
    write(chunk)
  }
}

async function gitInfo(rootDir: string) {
  const sha = await output(['git', 'rev-parse', '--short', 'HEAD'], rootDir)
  const status = await output(['git', 'status', '--short'], rootDir)
  return {
    sha,
    dirty: Boolean(status),
  }
}

async function runCommandLane(lane: LaneDefinition, options: QualityGateOptions): Promise<LaneResult> {
  const started = Date.now()
  const command = lane.command ?? []
  const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
  const logPath = join(artifactRoot, 'logs', `${sanitizeId(lane.id)}.log`)

  if (options.dryRun) {
    mkdirSync(dirname(logPath), { recursive: true })
    writeFileSync(logPath, `$ ${command.join(' ')}\n[quality-gate] skipped: dry run\n`)
    return {
      id: lane.id,
      title: lane.title,
      status: 'skipped',
      command,
      durationMs: Date.now() - started,
      skipReason: 'dry run',
      logPath,
    }
  }

  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, `$ ${command.join(' ')}\n`)
  const proc = Bun.spawn(command, {
    cwd: options.rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode] = await Promise.all([
    proc.exited,
    pipeToLog(proc.stdout, logPath, (chunk) => process.stdout.write(chunk)),
    pipeToLog(proc.stderr, logPath, (chunk) => process.stderr.write(chunk)),
  ])

  return {
    id: lane.id,
    title: lane.title,
    status: exitCode === 0 ? 'passed' : 'failed',
    command,
    durationMs: Date.now() - started,
    exitCode,
    logPath,
  }
}

async function runBaselineCaseLane(lane: LaneDefinition, options: QualityGateOptions): Promise<LaneResult> {
  const started = Date.now()

  if (!options.allowLive) {
    return {
      id: lane.id,
      title: lane.title,
      status: 'skipped',
      durationMs: Date.now() - started,
      skipReason: 'live baseline cases require --allow-live',
    }
  }

  const caseId = lane.baselineCaseId ?? lane.id.replace(/^baseline:/, '').split(':')[0]
  const testCase = baselineCases.find((candidate) => candidate.id === caseId)
  if (!testCase) {
    return {
      id: lane.id,
      title: lane.title,
      status: 'failed',
      durationMs: Date.now() - started,
      error: `Unknown baseline case: ${caseId}`,
    }
  }

  const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
  return executeBaselineCase(
    testCase,
    options.rootDir,
    join(artifactRoot, 'cases', lane.id.replace(/[^a-zA-Z0-9._-]+/g, '-')),
    lane.baselineTarget,
  )
}

async function runLane(lane: LaneDefinition, options: QualityGateOptions): Promise<LaneResult> {
  if (lane.kind === 'baseline-case') {
    return runBaselineCaseLane(lane, options)
  }
  if (lane.kind === 'desktop-smoke') {
    const started = Date.now()

    if (!options.allowLive) {
      return {
        id: lane.id,
        title: lane.title,
        status: 'skipped',
        durationMs: Date.now() - started,
        skipReason: 'desktop agent-browser smoke requires --allow-live',
      }
    }

    const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
    return executeDesktopSmoke(
      options.rootDir,
      join(artifactRoot, 'cases', lane.id.replace(/[^a-zA-Z0-9._-]+/g, '-')),
      lane.id,
      lane.title,
      lane.baselineTarget,
    )
  }

  if (lane.kind === 'provider-smoke') {
    const started = Date.now()

    if (!options.allowLive) {
      return {
        id: lane.id,
        title: lane.title,
        status: 'skipped',
        durationMs: Date.now() - started,
        skipReason: 'provider smoke requires --allow-live',
      }
    }

    const artifactRoot = options.runOutputDir ?? join(options.rootDir, 'artifacts', 'quality-runs', options.runId ?? 'current')
    return executeProviderSmoke(
      options.rootDir,
      join(artifactRoot, 'cases', lane.id.replace(/[^a-zA-Z0-9._-]+/g, '-')),
      lane.id,
      lane.title,
      lane.baselineTarget,
    )
  }

  return runCommandLane(lane, options)
}

function summarize(results: LaneResult[]) {
  return {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  }
}

function enforceReleaseLiveLanes(
  options: QualityGateOptions,
  lanes: LaneDefinition[],
  results: LaneResult[],
) {
  if (options.mode !== 'release' || options.dryRun) {
    return results
  }

  return results.map((result, index) => {
    if (result.status !== 'skipped' || !lanes[index]?.live) {
      return result
    }

    return {
      ...result,
      status: 'failed' as const,
      error: result.skipReason ?? 'release live lane was skipped',
      skipReason: undefined,
    }
  })
}

export async function runQualityGate(options: QualityGateOptions) {
  return runQualityGateLanes(options, lanesForMode(options.mode, options.baselineTargets))
}

export async function runQualityGateLanes(
  options: QualityGateOptions,
  lanes: LaneDefinition[],
  executeLane: LaneExecutor = runLane,
) {
  const runId = options.runId ?? nowId()
  const startedAt = new Date().toISOString()
  const artifactsRoot = options.artifactsDir ?? join(options.rootDir, 'artifacts', 'quality-runs')
  const outputDir = join(artifactsRoot, runId)
  mkdirSync(outputDir, { recursive: true })
  const selectedLanes = filterLanesForOptions(lanes, options)

  const runOptions = { ...options, runId, runOutputDir: outputDir }
  const rawResults: LaneResult[] = []
  for (const lane of selectedLanes) {
    const result = await executeLane(lane, runOptions)
    rawResults.push(result)
  }
  const results = enforceReleaseLiveLanes(options, selectedLanes, rawResults)

  const report: QualityGateReport = {
    schemaVersion: 1,
    runId,
    mode: options.mode,
    dryRun: options.dryRun,
    allowLive: options.allowLive,
    startedAt,
    finishedAt: new Date().toISOString(),
    rootDir: options.rootDir,
    git: await gitInfo(options.rootDir),
    results,
    summary: summarize(results),
  }

  writeReport(report, outputDir)
  return { report, outputDir }
}
