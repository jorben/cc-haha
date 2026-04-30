import { useCallback, useMemo, useState } from 'react'
import { sessionsApi, type SessionRewindResponse } from '../../api/sessions'
import { useTranslation } from '../../i18n'
import { WorkspaceDiffSurface } from '../workspace/WorkspaceCodeSurface'

type DiffPreviewState = {
  loading: boolean
  diff?: string
  error?: string
}

type CurrentTurnChangeCardProps = {
  sessionId: string
  preview: SessionRewindResponse
  workDir: string | null
  error: string | null
  isUndoing: boolean
  onUndo: () => void
}

export function CurrentTurnChangeCard({
  sessionId,
  preview,
  workDir,
  error,
  isUndoing,
  onUndo,
}: CurrentTurnChangeCardProps) {
  const t = useTranslation()
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [diffByPath, setDiffByPath] = useState<Record<string, DiffPreviewState>>({})

  const files = useMemo(
    () => preview.code.filesChanged.map((filePath) => relativizeWorkspacePath(filePath, workDir)),
    [preview.code.filesChanged, workDir],
  )

  const toggleDiff = useCallback((filePath: string) => {
    const nextExpandedPath = expandedPath === filePath ? null : filePath
    setExpandedPath(nextExpandedPath)
    if (!nextExpandedPath || diffByPath[filePath]?.diff || diffByPath[filePath]?.loading) {
      return
    }

    setDiffByPath((current) => ({
      ...current,
      [filePath]: { loading: true },
    }))

    void sessionsApi
      .getWorkspaceDiff(sessionId, filePath)
      .then((result) => {
        setDiffByPath((current) => ({
          ...current,
          [filePath]: {
            loading: false,
            diff: result.state === 'ok' ? result.diff || '' : undefined,
            error: result.state === 'ok'
              ? undefined
              : result.error || t('chat.turnChangesDiffUnavailable'),
          },
        }))
      })
      .catch((diffError) => {
        setDiffByPath((current) => ({
          ...current,
          [filePath]: {
            loading: false,
            error: diffError instanceof Error
              ? diffError.message
              : String(diffError),
          },
        }))
      })
  }, [diffByPath, expandedPath, sessionId, t])

  return (
    <section
      className="mx-auto mb-5 w-full max-w-[860px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
      aria-label={t('chat.turnChangesCardLabel')}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('chat.turnChangesTitle', { count: files.length })}
            </span>
            <span className="font-mono text-sm font-semibold text-[var(--color-success)]">
              +{preview.code.insertions}
            </span>
            <span className="font-mono text-sm font-semibold text-[var(--color-error)]">
              -{preview.code.deletions}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
            {t('chat.turnChangesSubtitle')}
          </div>
        </div>

        <button
          type="button"
          onClick={onUndo}
          disabled={isUndoing}
          aria-label={t('chat.turnChangesUndoAria')}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[15px]">undo</span>
          {isUndoing ? t('chat.turnChangesUndoing') : t('chat.turnChangesUndo')}
        </button>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {files.map((filePath) => {
          const isExpanded = expandedPath === filePath
          const diffState = diffByPath[filePath]
          return (
            <div key={filePath}>
              <button
                type="button"
                onClick={() => toggleDiff(filePath)}
                aria-label={t(
                  isExpanded ? 'chat.turnChangesHideDiffAria' : 'chat.turnChangesShowDiffAria',
                  { path: filePath },
                )}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand)]/35"
              >
                <span className="material-symbols-outlined shrink-0 text-[17px] text-[var(--color-text-tertiary)]">
                  {isExpanded ? 'keyboard_arrow_down' : 'chevron_right'}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                  {filePath}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-4 py-3">
                  {diffState?.loading ? (
                    <div className="text-xs text-[var(--color-text-tertiary)]">
                      {t('chat.turnChangesDiffLoading')}
                    </div>
                  ) : diffState?.error ? (
                    <div className="text-xs text-[var(--color-error)]">
                      {diffState.error}
                    </div>
                  ) : diffState?.diff ? (
                    <WorkspaceDiffSurface
                      value={diffState.diff}
                      path={filePath}
                      className="max-h-[430px] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-code-bg)]"
                    />
                  ) : (
                    <div className="text-xs text-[var(--color-text-tertiary)]">
                      {t('chat.turnChangesDiffUnavailable')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="border-t border-[var(--color-error)]/20 bg-[var(--color-error-container)]/18 px-4 py-3 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}
    </section>
  )
}

function relativizeWorkspacePath(filePath: string, workDir: string | null): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (!workDir || !normalizedPath.startsWith('/')) return normalizedPath

  const normalizedWorkDir = workDir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalizedPath === normalizedWorkDir) return ''
  if (normalizedPath.startsWith(`${normalizedWorkDir}/`)) {
    return normalizedPath.slice(normalizedWorkDir.length + 1)
  }
  return normalizedPath
}
