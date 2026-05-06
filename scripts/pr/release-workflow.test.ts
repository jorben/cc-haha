import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('release desktop workflow', () => {
  test('runs a quality preflight before packaging matrix builds', () => {
    const workflow = readFileSync('.github/workflows/release-desktop.yml', 'utf8')

    expect(workflow).toContain('quality-preflight:')
    expect(workflow).toContain('run: bun run quality:gate --mode pr --artifacts-dir artifacts/quality-runs')
    expect(workflow).toContain('cat "$latest_report" >> "$GITHUB_STEP_SUMMARY"')
    expect(workflow).toContain('name: release-quality-gate')
    expect(workflow).toContain('path: artifacts/quality-runs/')
    expect(workflow).toContain('retention-days: 14')
    expect(workflow).toContain('needs: quality-preflight')
  })
})
