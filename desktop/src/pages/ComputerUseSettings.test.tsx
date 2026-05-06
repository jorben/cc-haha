import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

import { ComputerUseSettings } from './ComputerUseSettings'
import { useSettingsStore } from '../stores/settingsStore'

const computerUseApiMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getInstalledApps: vi.fn(),
  getAuthorizedApps: vi.fn(),
  setAuthorizedApps: vi.fn(),
  runSetup: vi.fn(),
  openSettings: vi.fn(),
}))

vi.mock('../api/computerUse', () => ({
  computerUseApi: computerUseApiMock,
}))

const readyStatus = {
  platform: 'darwin',
  supported: true,
  python: {
    installed: true,
    version: '3.12.0',
    path: '/usr/bin/python3',
  },
  venv: {
    created: false,
    path: '/tmp/venv',
  },
  dependencies: {
    installed: false,
    requirementsFound: true,
  },
  permissions: {
    accessibility: null,
    screenRecording: null,
  },
}

const enabledConfig = {
  enabled: true,
  authorizedApps: [],
  grantFlags: {
    clipboardRead: true,
    clipboardWrite: true,
    systemKeyCombos: true,
  },
}

describe('ComputerUseSettings', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'en' })
    computerUseApiMock.getStatus.mockReset()
    computerUseApiMock.getInstalledApps.mockReset()
    computerUseApiMock.getAuthorizedApps.mockReset()
    computerUseApiMock.setAuthorizedApps.mockReset()
    computerUseApiMock.runSetup.mockReset()
    computerUseApiMock.openSettings.mockReset()

    computerUseApiMock.getStatus.mockResolvedValue(readyStatus)
    computerUseApiMock.getAuthorizedApps.mockResolvedValue(enabledConfig)
    computerUseApiMock.setAuthorizedApps.mockResolvedValue({ ok: true })
  })

  it('renders the stored disabled state with the MCP exposure hint', async () => {
    computerUseApiMock.getAuthorizedApps.mockResolvedValue({
      ...enabledConfig,
      enabled: false,
    })

    render(<ComputerUseSettings />)

    const toggle = await screen.findByLabelText('Enabled')
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(
      screen.getByText(/will not inject the computer-use MCP server/i),
    ).toBeInTheDocument()
  })

  it('saves the Computer Use enablement toggle independently', async () => {
    render(<ComputerUseSettings />)

    const toggle = await screen.findByLabelText('Enabled')
    await waitFor(() => expect(computerUseApiMock.getAuthorizedApps).toHaveBeenCalled())

    await act(async () => {
      fireEvent.click(toggle)
      await Promise.resolve()
    })

    expect(computerUseApiMock.setAuthorizedApps).toHaveBeenCalledWith({
      enabled: false,
    })
  })
})
