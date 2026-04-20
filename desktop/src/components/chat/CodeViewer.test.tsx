import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CodeViewer } from './CodeViewer'

vi.mock('react-shiki', () => ({
  ShikiHighlighter: ({ children }: { children: string }) => (
    <div data-testid="shiki-container">
      <code>{children}</code>
    </div>
  ),
}))

describe('CodeViewer', () => {
  it('keeps the same inner padding for highlighted code content', async () => {
    const { container } = render(
      <CodeViewer code={'cd testb\nnpm run dev'} language="bash" />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('shiki-container')).toBeTruthy()
    })

    const contentWrapper = container.querySelector('[data-code-viewer-content]') as HTMLElement | null
    expect(contentWrapper).toBeTruthy()
    expect(contentWrapper?.style.padding).toBe('0.5rem 12px')
  })
})
