import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QualityGateReport } from './types'

export function writeReport(report: QualityGateReport, outputDir: string) {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(outputDir, 'report.md'), renderMarkdownReport(report))
  writeFileSync(join(outputDir, 'junit.xml'), renderJUnitReport(report))
}

export function renderMarkdownReport(report: QualityGateReport) {
  const lines = [
    `# Quality Gate Report`,
    '',
    `- Run: ${report.runId}`,
    `- Mode: ${report.mode}`,
    `- Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    `- Live checks allowed: ${report.allowLive ? 'yes' : 'no'}`,
    `- Git SHA: ${report.git.sha ?? 'unknown'}`,
    `- Dirty worktree: ${report.git.dirty ? 'yes' : 'no'}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    '',
    `## Summary`,
    '',
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Skipped: ${report.summary.skipped}`,
    '',
    `## Lanes`,
    '',
  ]

  for (const result of report.results) {
    lines.push(`### ${result.title}`)
    lines.push('')
    lines.push(`- ID: ${result.id}`)
    lines.push(`- Status: ${result.status}`)
    lines.push(`- Duration: ${result.durationMs}ms`)
    if (result.command) {
      lines.push(`- Command: \`${result.command.join(' ')}\``)
    }
    if (result.exitCode !== undefined) {
      lines.push(`- Exit code: ${result.exitCode}`)
    }
    if (result.skipReason) {
      lines.push(`- Skip reason: ${result.skipReason}`)
    }
    if (result.error) {
      lines.push(`- Error: ${result.error}`)
    }
    if (result.artifactDir) {
      lines.push(`- Artifacts: ${result.artifactDir}`)
    }
    if (result.logPath) {
      lines.push(`- Log: ${result.logPath}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function renderJUnitReport(report: QualityGateReport) {
  const failures = report.results.filter((result) => result.status === 'failed').length
  const skipped = report.results.filter((result) => result.status === 'skipped').length
  const durationSeconds = Math.max(0, (Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000)
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="quality-gate.${escapeXml(report.mode)}" tests="${report.results.length}" failures="${failures}" skipped="${skipped}" time="${durationSeconds.toFixed(3)}">`,
  ]

  for (const result of report.results) {
    const testcaseTime = Math.max(0, result.durationMs / 1000).toFixed(3)
    lines.push(`  <testcase classname="quality-gate.${escapeXml(report.mode)}" name="${escapeXml(result.id)}" time="${testcaseTime}">`)
    if (result.status === 'failed') {
      const message = result.error ?? (result.exitCode === undefined ? 'lane failed' : `exit code ${result.exitCode}`)
      lines.push(`    <failure message="${escapeXml(message)}">${escapeXml([
        `Title: ${result.title}`,
        result.command ? `Command: ${result.command.join(' ')}` : null,
        result.logPath ? `Log: ${result.logPath}` : null,
        result.artifactDir ? `Artifacts: ${result.artifactDir}` : null,
      ].filter(Boolean).join('\n'))}</failure>`)
    }
    if (result.status === 'skipped') {
      lines.push(`    <skipped message="${escapeXml(result.skipReason ?? 'skipped')}"/>`)
    }
    lines.push('  </testcase>')
  }

  lines.push('</testsuite>')
  return lines.join('\n') + '\n'
}
