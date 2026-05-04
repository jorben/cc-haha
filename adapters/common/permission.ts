export type PermissionDecision = {
  requestId: string
  allowed: boolean
  rule?: 'always'
}

export function parsePermissionCommand(text: string): PermissionDecision | null {
  const match = text.trim().match(/^\/(allow|always|allow-always|deny)\s+(\S+)/i)
  if (!match) return null

  const action = match[1]!.toLowerCase()
  const requestId = match[2]!
  if (action === 'deny') return { requestId, allowed: false }
  if (action === 'always' || action === 'allow-always') return { requestId, allowed: true, rule: 'always' }
  return { requestId, allowed: true }
}

export function parsePermitCallbackData(data: string): PermissionDecision | null {
  const parts = data.split(':')
  if (parts.length !== 3 || parts[0] !== 'permit' || !parts[1]) return null

  switch (parts[2]) {
    case 'yes':
      return { requestId: parts[1], allowed: true }
    case 'always':
      return { requestId: parts[1], allowed: true, rule: 'always' }
    case 'no':
      return { requestId: parts[1], allowed: false }
    default:
      return null
  }
}

export function formatPermissionInstructions(requestId: string): string {
  return [
    `回复 /allow ${requestId} 允许一次`,
    `/always ${requestId} 永久允许`,
    `/deny ${requestId} 拒绝。`,
  ].join('，')
}

export function formatPermissionDecisionStatus(decision: Pick<PermissionDecision, 'allowed' | 'rule'>): string {
  if (!decision.allowed) return '❌ 已拒绝'
  return decision.rule === 'always' ? '♾️ 已永久允许' : '✅ 已允许'
}
