'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Check, Copy, Link2, LockKeyhole, RefreshCw, Unplug } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ScopedChatPanel } from '@/components/chat/ScopedChatPanel'
import type { AgentBootstrapDto, AgentConnectorDto } from '@/lib/agent-collaboration/types'
import { AGENT_COLLABORATION_TRANSPORT } from './agentCollaborationTransport'

type PairingDto = {
  code: string
  expiresAt: string
}

type ProviderChoice = 'codex' | 'claude-code' | 'other'

const BASE_PATH = '/api/auth-mvp/agent-collaboration'

export function AgentCollaborationClient({ locale }: { locale: string }) {
  const t = useTranslations('teskeid.agentCollaboration')
  const [bootstrap, setBootstrap] = useState<AgentBootstrapDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pairing, setPairing] = useState<PairingDto | null>(null)
  const [provider, setProvider] = useState<ProviderChoice>('codex')
  const [pairingLoading, setPairingLoading] = useState(false)
  const [pairingError, setPairingError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [disconnectError, setDisconnectError] = useState(false)
  const pairingConnectorIdsRef = useRef('')
  const mountedRef = useRef(true)

  const loadBootstrap = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true)
      setLoadError(false)
    }
    try {
      const response = await fetch(`${BASE_PATH}/bootstrap`, { cache: 'no-store' })
      if (!response.ok) throw new Error('bootstrap failed')
      const data = await response.json() as AgentBootstrapDto
      if (!mountedRef.current) return
      setBootstrap(data)
      setLoadError(false)
    } catch {
      if (!mountedRef.current || background) return
      setLoadError(true)
    } finally {
      if (mountedRef.current && !background) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let stopped = false
    let polling = false
    let timeoutId: number | undefined
    const schedule = () => {
      if (stopped) return
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(refresh, 5_000)
    }
    const refresh = async () => {
      if (stopped || polling) return
      if (document.visibilityState !== 'visible') {
        schedule()
        return
      }
      polling = true
      await loadBootstrap(true)
      polling = false
      schedule()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      void refresh()
    }
    void loadBootstrap().finally(schedule)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopped = true
      mountedRef.current = false
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadBootstrap])

  const activeConnectorCount = useMemo(
    () => bootstrap?.connectors.filter(isActiveConnector).length ?? 0,
    [bootstrap?.connectors],
  )
  const onlineConnectorCount = useMemo(
    () => bootstrap?.connectors.filter(isOnlineConnector).length ?? 0,
    [bootstrap?.connectors],
  )
  const activeConnectorIds = useMemo(
    () => bootstrap?.connectors
      .filter(isActiveConnector)
      .map(connector => connector.id)
      .sort()
      .join(',') ?? '',
    [bootstrap?.connectors],
  )

  useEffect(() => {
    if (pairing && activeConnectorIds !== pairingConnectorIdsRef.current) {
      setPairing(null)
      setCopied(false)
    }
  }, [activeConnectorIds, pairing])

  async function createPairing() {
    if (pairingLoading) return
    setPairingLoading(true)
    setPairingError(false)
    setCopied(false)
    try {
      const displayName = provider === 'codex'
        ? t('providerCodex')
        : provider === 'claude-code'
          ? t('providerClaude')
          : t('providerOther')
      const response = await fetch(`${BASE_PATH}/pairings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerKey: provider, displayName }),
      })
      if (!response.ok) throw new Error('pairing failed')
      const data = await response.json() as PairingDto
      pairingConnectorIdsRef.current = activeConnectorIds
      setPairing(data)
    } catch {
      setPairingError(true)
    } finally {
      setPairingLoading(false)
    }
  }

  async function copyPairingCode() {
    if (!pairing) return
    try {
      await navigator.clipboard.writeText(pairing.code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function disconnect(connector: AgentConnectorDto) {
    if (!window.confirm(t('disconnectConfirm', { name: connector.displayName }))) return
    setDisconnectError(false)
    setDisconnectingId(connector.id)
    try {
      const response = await fetch(`${BASE_PATH}/connectors/${encodeURIComponent(connector.id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('disconnect failed')
      await loadBootstrap(true)
    } catch {
      setDisconnectError(true)
    } finally {
      setDisconnectingId(null)
    }
  }

  if (loading) {
    return <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
  }

  if (loadError || !bootstrap) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/20 bg-card p-4">
        <p className="text-sm text-destructive">{t('loadError')}</p>
        <button
          type="button"
          onClick={() => loadBootstrap()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw size={15} aria-hidden />
          {t('retry')}
        </button>
      </div>
    )
  }

  const panelLabels = {
    empty: t('chatEmpty'),
    loading: t('chatLoading'),
    loadError: t('chatLoadError'),
    retry: t('retry'),
    inputPlaceholder: t('messagePlaceholder'),
    send: t('send'),
    sendError: t('sendError'),
    deleted: t('deleted'),
    loadOlder: t('loadOlder'),
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="connection-heading" className="rounded-xl border border-black/5 bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="connection-heading" className="text-sm font-semibold text-foreground">
              {t('connectionTitle')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeConnectorCount > 0
                ? t('connectedCount', { count: activeConnectorCount })
                : t('noConnector')}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${onlineConnectorCount > 0 ? 'bg-emerald-600' : activeConnectorCount > 0 ? 'bg-amber-500' : 'bg-muted-foreground/50'}`}
            />
            {onlineConnectorCount > 0
              ? t('statusOnline')
              : activeConnectorCount > 0
                ? t('statusPaired')
                : t('statusWaiting')}
          </span>
        </div>

        {bootstrap.connectors.length > 0 && (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {bootstrap.connectors.map(connector => (
              <li key={connector.id} className="flex min-h-12 items-center gap-3 py-2">
                <Bot size={17} className="shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{connector.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {connectorStatusLabel(connector, t)}
                    {connector.lastSeenAt && ` · ${t('lastSeen', { time: formatTime(connector.lastSeenAt, locale) })}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(connector)}
                  disabled={disconnectingId === connector.id}
                  aria-label={t('disconnectAria', { name: connector.displayName })}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Unplug size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {disconnectError && <p role="alert" className="mt-2 text-xs text-destructive">{t('disconnectError')}</p>}

        <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="agent-provider">
          {t('providerLabel')}
        </label>
        <select
          id="agent-provider"
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as ProviderChoice)
            setPairing(null)
            setPairingError(false)
            setCopied(false)
          }}
          disabled={pairingLoading}
          className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
        >
          <option value="codex">{t('providerCodex')}</option>
          <option value="claude-code">{t('providerClaude')}</option>
          <option value="other">{t('providerOther')}</option>
        </select>

        {activeConnectorCount > 0 && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {t('replacementWarning')}
          </p>
        )}

        <button
          type="button"
          onClick={createPairing}
          disabled={pairingLoading}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-background px-3 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Link2 size={16} aria-hidden />
          {pairingLoading ? t('pairingLoading') : t('pairAgent')}
        </button>

        {pairingError && <p role="alert" className="mt-2 text-xs text-destructive">{t('pairingError')}</p>}

        {pairing && (
          <div className="mt-3 border-t border-border pt-3" aria-live="polite">
            <p className="text-xs text-muted-foreground">{t('pairingInstructions')}</p>
            <div className="mt-2 flex items-stretch gap-2">
              <code className="flex min-h-11 min-w-0 flex-1 items-center justify-start overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 text-sm font-semibold tracking-[0.12em] text-foreground sm:justify-center sm:text-base sm:tracking-[0.18em]">
                {pairing.code}
              </code>
              <button
                type="button"
                onClick={copyPairingCode}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={copied ? t('copied') : t('copyCode')}
              >
                {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {t('pairingExpires', { time: formatTime(pairing.expiresAt, locale) })}
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="safety-heading" className="border-y border-border py-3">
        <div className="flex gap-3">
          <LockKeyhole size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 id="safety-heading" className="text-sm font-medium">{t('readOnlyTitle')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('readOnlyDescription')}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="conversation-heading" className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 id="conversation-heading" className="text-base font-semibold">
            {t('conversationFallbackTitle')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('conversationDescription')}</p>
        </div>
        <ScopedChatPanel
          key={bootstrap.conversation.id}
          threadId={bootstrap.conversation.id}
          transport={AGENT_COLLABORATION_TRANSPORT}
          labels={panelLabels}
          pageSize={30}
          pollingIntervalMs={5_000}
          composerMaxLength={4_000}
          composerMultiline
          locale={locale}
          listClassName="flex min-h-64 max-h-[50dvh] flex-col gap-3 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-3"
        />
        {bootstrap.latestRun && bootstrap.latestRun.status !== 'completed' && (
          <p
            role="status"
            className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
              bootstrap.latestRun.status === 'failed'
                ? 'border-destructive/20 bg-destructive/5 text-destructive'
                : 'border-border bg-muted/30 text-muted-foreground'
            }`}
          >
            {bootstrap.latestRun.status === 'queued'
              ? t('runQueued')
              : bootstrap.latestRun.status === 'working'
                ? t('runWorking')
                : t('runFailed')}
          </p>
        )}
      </section>
    </div>
  )
}

function isActiveConnector(connector: AgentConnectorDto): boolean {
  const expiresAt = Date.parse(connector.tokenExpiresAt)
  return connector.status === 'active' && Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function connectorStatusLabel(
  connector: AgentConnectorDto,
  t: (key: 'statusOnline' | 'statusPaired' | 'statusOffline') => string,
): string {
  if (!isActiveConnector(connector)) return t('statusOffline')
  return isOnlineConnector(connector) ? t('statusOnline') : t('statusPaired')
}

function isOnlineConnector(connector: AgentConnectorDto): boolean {
  if (!isActiveConnector(connector) || !connector.lastSeenAt) return false
  const lastSeenAt = Date.parse(connector.lastSeenAt)
  return Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt <= 60_000
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
}
