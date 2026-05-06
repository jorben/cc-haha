import { describe, expect, test } from 'bun:test'
import { evaluateThresholds, parseLcov } from './coverage'

describe('coverage gate helpers', () => {
  test('parses lcov totals into percentages', () => {
    const summary = parseLcov([
      'TN:',
      'SF:src/a.ts',
      'FNF:4',
      'FNH:3',
      'BRF:10',
      'BRH:7',
      'LF:20',
      'LH:18',
      'end_of_record',
      'SF:src/b.ts',
      'FNF:1',
      'FNH:1',
      'LF:10',
      'LH:5',
      'end_of_record',
    ].join('\n'))

    expect(summary.lines.pct).toBe(76.67)
    expect(summary.functions.pct).toBe(80)
    expect(summary.branches.pct).toBe(70)
  })

  test('reports minimum threshold failures', () => {
    const failures = evaluateThresholds([
      {
        id: 'root-server',
        title: 'Root',
        status: 'passed',
        command: ['bun', 'test'],
        durationMs: 1,
        logPath: 'coverage.log',
        summary: {
          lines: { total: 100, covered: 79, pct: 79 },
          functions: { total: 10, covered: 9, pct: 90 },
          branches: { total: 10, covered: 8, pct: 80 },
          statements: { total: 100, covered: 79, pct: 79 },
        },
      },
    ], {
      schemaVersion: 1,
      minimums: {
        'root-server': {
          lines: 80,
        },
      },
    })

    expect(failures).toEqual(['root-server: lines coverage 79% is below minimum 80%'])
  })

  test('treats failed suite execution as a coverage failure', () => {
    const failures = evaluateThresholds([
      {
        id: 'desktop',
        title: 'Desktop',
        status: 'failed',
        command: ['bun', 'run', 'test'],
        durationMs: 1,
        logPath: 'coverage.log',
        error: 'coverage command exited with 1',
      },
    ], {
      schemaVersion: 1,
      minimums: {},
    })

    expect(failures).toEqual(['desktop: coverage command exited with 1'])
  })

  test('does not require every suite to exist in the ratchet baseline', () => {
    const failures = evaluateThresholds([
      {
        id: 'new-suite',
        title: 'New suite',
        status: 'passed',
        command: ['bun', 'test'],
        durationMs: 1,
        logPath: 'coverage.log',
        summary: {
          lines: { total: 100, covered: 90, pct: 90 },
          functions: { total: 10, covered: 9, pct: 90 },
          branches: { total: 10, covered: 8, pct: 80 },
          statements: { total: 100, covered: 90, pct: 90 },
        },
      },
    ], {
      schemaVersion: 1,
      minimums: {
        'new-suite': {
          branches: 85,
        },
      },
      ratchet: {
        baselinePath: 'scripts/quality-gate/coverage-baseline.json',
        allowedDropPercent: 0,
      },
    })

    expect(failures).toEqual(['new-suite: branches coverage 80% is below minimum 85%'])
  })
})
