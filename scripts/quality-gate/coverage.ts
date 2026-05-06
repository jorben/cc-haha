#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { loadQuarantineManifest, quarantinedPathSet } from './quarantine'

type CoverageMetric = {
  total: number
  covered: number
  pct: number
}

type CoverageSummary = {
  lines: CoverageMetric
  functions: CoverageMetric
  branches: CoverageMetric
  statements: CoverageMetric
}

type SuiteCoverage = {
  id: string
  title: string
  status: 'passed' | 'failed'
  command: string[]
  durationMs: number
  summary?: CoverageSummary
  logPath: string
  error?: string
}

type CoverageThresholds = {
  schemaVersion: 1
  minimums: Record<string, Partial<Record<keyof CoverageSummary, number>>>
  ratchet?: {
    baselinePath: string
    allowedDropPercent: number
  }
}

type BaselineFile = {
  schemaVersion: 1
  generatedAt?: string
  suites: Record<string, CoverageSummary>
}

type CoverageReport = {
  schemaVersion: 1
  runId: string
  startedAt: string
  finishedAt: string
  outputDir: string
  baselineRef?: string
  suites: SuiteCoverage[]
  failures: string[]
}

const ROOT_DIR = process.cwd()
const DEFAULT_THRESHOLDS_PATH = join(ROOT_DIR, 'scripts', 'quality-gate', 'coverage-thresholds.json')

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      args.set(arg, next)
      index += 1
    } else {
      args.set(arg, true)
    }
  }
  return args
}

function pct(covered: number, total: number) {
  return total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2))
}

function metric(covered: number, total: number): CoverageMetric {
  return { covered, total, pct: pct(covered, total) }
}

function normalize(path: string, rootDir = ROOT_DIR) {
  return relative(rootDir, path).split(sep).join('/')
}

function walkTestFiles(path: string, files: string[], excluded: Set<string>, rootDir = ROOT_DIR) {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      walkTestFiles(join(path, entry), files, excluded, rootDir)
    }
    return
  }
  if (!stat.isFile()) return

  const normalized = normalize(path, rootDir)
  if (normalized.endsWith('.test.ts') && !excluded.has(normalized)) {
    files.push(normalized)
  }
}

function collectServerTestFiles(rootDir = ROOT_DIR) {
  const excluded = quarantinedPathSet(loadQuarantineManifest(undefined, { enforceReviewDate: true }))
  const files: string[] = []
  for (const root of ['src/server', 'src/tools', 'src/utils']) {
    walkTestFiles(join(rootDir, root), files, excluded, rootDir)
  }
  return files.sort()
}

export function parseLcov(content: string): CoverageSummary {
  let linesTotal = 0
  let linesCovered = 0
  let functionsTotal = 0
  let functionsCovered = 0
  let branchesTotal = 0
  let branchesCovered = 0

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('LF:')) linesTotal += Number(line.slice(3)) || 0
    if (line.startsWith('LH:')) linesCovered += Number(line.slice(3)) || 0
    if (line.startsWith('FNF:')) functionsTotal += Number(line.slice(4)) || 0
    if (line.startsWith('FNH:')) functionsCovered += Number(line.slice(4)) || 0
    if (line.startsWith('BRF:')) branchesTotal += Number(line.slice(4)) || 0
    if (line.startsWith('BRH:')) branchesCovered += Number(line.slice(4)) || 0
  }

  return {
    lines: metric(linesCovered, linesTotal),
    functions: metric(functionsCovered, functionsTotal),
    branches: metric(branchesCovered, branchesTotal),
    statements: metric(linesCovered, linesTotal),
  }
}

function parseVitestSummary(path: string): CoverageSummary {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    total: Record<string, { total: number; covered: number; pct: number }>
  }
  const total = raw.total
  return {
    lines: metric(total.lines.covered, total.lines.total),
    functions: metric(total.functions.covered, total.functions.total),
    branches: metric(total.branches.covered, total.branches.total),
    statements: metric(total.statements.covered, total.statements.total),
  }
}

async function runCommand(command: string[], cwd: string, logPath: string) {
  const started = Date.now()
  const proc = Bun.spawn(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, `$ ${command.join(' ')}\n${stdout}${stderr}`)
  return { exitCode, durationMs: Date.now() - started }
}

async function runSuite(
  id: string,
  title: string,
  command: string[],
  cwd: string,
  suiteDir: string,
  readSummary: () => CoverageSummary,
): Promise<SuiteCoverage> {
  mkdirSync(suiteDir, { recursive: true })
  const logPath = join(suiteDir, 'coverage.log')
  const result = await runCommand(command, cwd, logPath)
  if (result.exitCode !== 0) {
    return {
      id,
      title,
      status: 'failed',
      command,
      durationMs: result.durationMs,
      logPath,
      error: `coverage command exited with ${result.exitCode}`,
    }
  }

  try {
    return {
      id,
      title,
      status: 'passed',
      command,
      durationMs: result.durationMs,
      logPath,
      summary: readSummary(),
    }
  } catch (error) {
    return {
      id,
      title,
      status: 'failed',
      command,
      durationMs: result.durationMs,
      logPath,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function loadThresholds(path = DEFAULT_THRESHOLDS_PATH): CoverageThresholds {
  if (!existsSync(path)) {
    return { schemaVersion: 1, minimums: {} }
  }
  return JSON.parse(readFileSync(path, 'utf8')) as CoverageThresholds
}

function readGitFile(rootDir: string, ref: string, filePath: string) {
  const gitPath = filePath.startsWith('/')
    ? relative(rootDir, filePath).split(sep).join('/')
    : filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const proc = Bun.spawnSync(['git', 'show', `${ref}:${gitPath}`], {
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (proc.exitCode !== 0) {
    return null
  }
  return new TextDecoder().decode(proc.stdout)
}

function loadBaseline(path: string, rootDir = ROOT_DIR, baselineRef?: string): BaselineFile | null {
  if (baselineRef) {
    const raw = readGitFile(rootDir, baselineRef, path)
    return raw ? JSON.parse(raw) as BaselineFile : null
  }

  const resolved = path.startsWith('/') ? path : join(rootDir, path)
  if (!existsSync(resolved)) return null
  return JSON.parse(readFileSync(resolved, 'utf8')) as BaselineFile
}

export function evaluateThresholds(
  suites: SuiteCoverage[],
  thresholds: CoverageThresholds,
  rootDir = ROOT_DIR,
  baselineRef?: string,
) {
  const failures: string[] = []
  const baseline = thresholds.ratchet?.baselinePath
    ? loadBaseline(thresholds.ratchet.baselinePath, rootDir, baselineRef)
    : null
  const allowedDrop = thresholds.ratchet?.allowedDropPercent ?? 0

  for (const suite of suites) {
    if (suite.status !== 'passed' || !suite.summary) {
      failures.push(`${suite.id}: ${suite.error ?? 'coverage suite failed'}`)
      continue
    }

    const minimums = thresholds.minimums[suite.id] ?? {}
    for (const [metricName, minimum] of Object.entries(minimums)) {
      const actual = suite.summary[metricName as keyof CoverageSummary].pct
      if (actual + Number.EPSILON < minimum) {
        failures.push(`${suite.id}: ${metricName} coverage ${actual}% is below minimum ${minimum}%`)
      }
    }

    const baselineSummary = baseline?.suites[suite.id]
    if (!baselineSummary) continue
    for (const metricName of ['lines', 'functions', 'branches', 'statements'] as const) {
      const actual = suite.summary[metricName].pct
      const expected = baselineSummary[metricName].pct - allowedDrop
      if (actual + Number.EPSILON < expected) {
        failures.push(`${suite.id}: ${metricName} coverage ${actual}% dropped below baseline ${baselineSummary[metricName].pct}%`)
      }
    }
  }

  return failures
}

function renderReport(report: CoverageReport) {
  const lines = [
    '# Coverage Report',
    '',
    `- Run: ${report.runId}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Output: ${report.outputDir}`,
    ...(report.baselineRef ? [`- Baseline ref: ${report.baselineRef}`] : []),
    '',
    '| Suite | Status | Lines | Functions | Branches | Statements |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ]

  for (const suite of report.suites) {
    const summary = suite.summary
    lines.push(`| ${[
      suite.title,
      suite.status,
      summary ? `${summary.lines.pct}%` : '-',
      summary ? `${summary.functions.pct}%` : '-',
      summary ? `${summary.branches.pct}%` : '-',
      summary ? `${summary.statements.pct}%` : '-',
    ].join(' | ')} |`)
  }

  lines.push('', '## Failures', '')
  if (report.failures.length === 0) {
    lines.push('- none')
  } else {
    for (const failure of report.failures) {
      lines.push(`- ${failure}`)
    }
  }

  return lines.join('\n') + '\n'
}

export async function runCoverageGate(options: {
  rootDir?: string
  artifactsDir?: string
  runId?: string
  thresholdsPath?: string
  baselineRef?: string
} = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR
  const runId = options.runId ?? nowId()
  const outputDir = join(options.artifactsDir ?? join(rootDir, 'artifacts', 'coverage'), runId)
  const startedAt = new Date().toISOString()
  const baselineRef = options.baselineRef ?? process.env.COVERAGE_BASE_REF
  mkdirSync(outputDir, { recursive: true })

  const serverFiles = collectServerTestFiles(rootDir)
  const suites: SuiteCoverage[] = []

  suites.push(await runSuite(
    'root-server',
    'Root server/tools/utils',
    ['bun', 'test', '--coverage', '--coverage-reporter=lcov', '--coverage-reporter=text', '--coverage-dir', join(outputDir, 'root-server'), ...serverFiles],
    rootDir,
    join(outputDir, 'root-server'),
    () => parseLcov(readFileSync(join(outputDir, 'root-server', 'lcov.info'), 'utf8')),
  ))

  suites.push(await runSuite(
    'adapters',
    'IM adapters',
    ['bun', 'test', '--coverage', '--coverage-reporter=lcov', '--coverage-reporter=text', '--coverage-dir', join(outputDir, 'adapters')],
    join(rootDir, 'adapters'),
    join(outputDir, 'adapters'),
    () => parseLcov(readFileSync(join(outputDir, 'adapters', 'lcov.info'), 'utf8')),
  ))

  suites.push(await runSuite(
    'desktop',
    'Desktop React',
    [
      'bun',
      'run',
      'test',
      '--',
      '--run',
      '--coverage',
      '--coverage.reporter=json-summary',
      '--coverage.reporter=lcov',
      `--coverage.reportsDirectory=${join(outputDir, 'desktop')}`,
      '--testTimeout=20000',
    ],
    join(rootDir, 'desktop'),
    join(outputDir, 'desktop'),
    () => parseVitestSummary(join(outputDir, 'desktop', 'coverage-summary.json')),
  ))

  const thresholds = loadThresholds(options.thresholdsPath ?? join(rootDir, 'scripts', 'quality-gate', 'coverage-thresholds.json'))
  const failures = evaluateThresholds(suites, thresholds, rootDir, baselineRef)
  const report: CoverageReport = {
    schemaVersion: 1,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    outputDir,
    ...(baselineRef ? { baselineRef } : {}),
    suites,
    failures,
  }

  writeFileSync(join(outputDir, 'coverage-report.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(outputDir, 'coverage-report.md'), renderReport(report))
  return report
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2))
  const report = await runCoverageGate({
    artifactsDir: typeof args.get('--artifacts-dir') === 'string' ? String(args.get('--artifacts-dir')) : undefined,
    runId: typeof args.get('--run-id') === 'string' ? String(args.get('--run-id')) : undefined,
    thresholdsPath: typeof args.get('--thresholds') === 'string' ? String(args.get('--thresholds')) : undefined,
    baselineRef: typeof args.get('--baseline-ref') === 'string' ? String(args.get('--baseline-ref')) : undefined,
  })
  console.log(`Coverage report: ${report.outputDir}/coverage-report.md`)
  console.log(`Summary: passed=${report.suites.filter((suite) => suite.status === 'passed').length} failed=${report.failures.length}`)
  if (report.failures.length > 0) {
    process.exit(1)
  }
}
