import { baselineCases } from './baseline/cases'
import type { BaselineTarget, LaneDefinition, QualityGateMode } from './types'

export function lanesForMode(mode: QualityGateMode, baselineTargets: BaselineTarget[] = []): LaneDefinition[] {
  const lanes: LaneDefinition[] = [
    {
      id: 'impact-report',
      title: 'Impact report',
      description: 'Summarize changed areas, required local checks, and risk notes.',
      kind: 'command',
      command: ['bun', 'run', 'check:impact'],
      requiredForModes: ['pr', 'baseline', 'release'],
    },
    {
      id: 'pr-checks',
      title: 'Path-aware PR checks',
      description: 'Run the existing local PR gate with stable path-aware checks.',
      kind: 'command',
      command: ['bun', 'run', 'check:pr'],
      requiredForModes: ['pr', 'release'],
    },
    {
      id: 'quarantine',
      title: 'Quarantine governance',
      description: 'Validate quarantined tests still have owners, exit criteria, and active review windows.',
      kind: 'command',
      command: ['bun', 'run', 'check:quarantine'],
      requiredForModes: ['pr', 'baseline', 'release'],
    },
    {
      id: 'coverage',
      title: 'Coverage gate',
      description: 'Run unit/component coverage suites and enforce the ratcheted coverage baseline.',
      kind: 'command',
      command: ['bun', 'run', 'check:coverage'],
      requiredForModes: ['pr', 'baseline', 'release'],
    },
    {
      id: 'baseline-catalog',
      title: 'Baseline case catalog validation',
      description: 'Validate real Coding Agent baseline case definitions and fixture metadata.',
      kind: 'command',
      command: ['bun', 'test', 'scripts/quality-gate/baseline/cases.test.ts'],
      requiredForModes: ['baseline', 'release'],
    },
    {
      id: 'native-checks',
      title: 'Native desktop checks',
      description: 'Build sidecars and run the Tauri native compile check.',
      kind: 'command',
      command: ['bun', 'run', 'check:native'],
      requiredForModes: ['release'],
    },
  ]

  const targets = baselineTargets.length > 0
    ? baselineTargets
    : [{ providerId: null, modelId: 'current', label: 'current-runtime' }]

  for (const testCase of baselineCases) {
    for (const target of targets) {
      const targetSlug = target.label.replace(/[^a-zA-Z0-9._-]+/g, '-')
      lanes.push({
        id: `baseline:${testCase.id}:${targetSlug}`,
        title: `${testCase.title} (${target.label})`,
        description: testCase.description,
        kind: 'baseline-case',
        baselineCaseId: testCase.id,
        baselineTarget: target,
        requiredForModes: ['baseline', 'release'],
        live: true,
      })
    }
  }

  for (const target of targets) {
    const targetSlug = target.label.replace(/[^a-zA-Z0-9._-]+/g, '-')
    lanes.push({
      id: `provider-smoke:${targetSlug}`,
      title: `Provider live/proxy smoke (${target.label})`,
      description: 'Validate live provider connectivity. Saved or active OpenAI-compatible providers also exercise the local non-stream and streaming proxy endpoints; env-only targets validate upstream connectivity and transform pipeline.',
      kind: 'provider-smoke',
      baselineTarget: target,
      requiredForModes: ['baseline', 'release'],
      live: true,
    })
  }

  for (const target of targets) {
    const targetSlug = target.label.replace(/[^a-zA-Z0-9._-]+/g, '-')
    lanes.push({
      id: `desktop-smoke:agent-browser-chat:${targetSlug}`,
      title: `Desktop agent-browser chat smoke (${target.label})`,
      description: 'Open the desktop web app with agent-browser, send a real chat task, and verify the model edits a fixture project through the UI.',
      kind: 'desktop-smoke',
      baselineTarget: target,
      requiredForModes: ['baseline', 'release'],
      live: true,
    })
  }

  return lanes.filter((lane) => lane.requiredForModes.includes(mode))
}
