import { describe, expect, it } from 'bun:test'
import {
  formatPermissionDecisionStatus,
  formatPermissionInstructions,
  parsePermissionCommand,
  parsePermitCallbackData,
} from '../permission.js'

describe('permission helpers', () => {
  it('parses text permission commands', () => {
    expect(parsePermissionCommand('/allow req-1')).toEqual({ requestId: 'req-1', allowed: true })
    expect(parsePermissionCommand('/always req-2')).toEqual({ requestId: 'req-2', allowed: true, rule: 'always' })
    expect(parsePermissionCommand('/allow-always req-3')).toEqual({ requestId: 'req-3', allowed: true, rule: 'always' })
    expect(parsePermissionCommand('/deny req-4')).toEqual({ requestId: 'req-4', allowed: false })
  })

  it('parses callback permission actions', () => {
    expect(parsePermitCallbackData('permit:req-1:yes')).toEqual({ requestId: 'req-1', allowed: true })
    expect(parsePermitCallbackData('permit:req-2:always')).toEqual({ requestId: 'req-2', allowed: true, rule: 'always' })
    expect(parsePermitCallbackData('permit:req-3:no')).toEqual({ requestId: 'req-3', allowed: false })
    expect(parsePermitCallbackData('permit:req-4:unknown')).toBeNull()
  })

  it('formats text fallback and status labels', () => {
    expect(formatPermissionInstructions('req-1')).toContain('/always req-1')
    expect(formatPermissionDecisionStatus({ allowed: true, rule: 'always' })).toContain('永久允许')
    expect(formatPermissionDecisionStatus({ allowed: false })).toContain('拒绝')
  })
})
