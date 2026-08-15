'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink, LogIn, UserPlus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { BookingActionResult, BookingDetailView } from '@/lib/bookings/contracts'
import { BookingCancellationDialog } from './BookingCancellationDialog'
import { BookingChatPanel } from './BookingChatPanel'
import { BookingPendingLink } from './BookingPendingLink'
import { BookingStatusPanel } from './BookingStatusPanel'
import { formatRequestedBookingTime } from './format'

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function splitEmails(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,;]+/).map(email => email.trim()).filter(Boolean)))
}

export function BookingDetailClient({
  initialView,
  providerContext = false,
}: {
  initialView: BookingDetailView
  providerContext?: boolean
}) {
  const t = useTranslations('bookings')
  const locale = useLocale()
  const router = useRouter()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [claimEmails, setClaimEmails] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'owner' | 'member'>('member')
  const actionEnvelope = useRef<{ fingerprint: string; id: string } | null>(null)
  const actionInFlight = useRef(false)
  const mutationPending = pendingAction !== null || isRefreshing
  const workflowStateKey = initialView.workflowState?.audience === 'provider'
    ? initialView.workflowState.stateId
    : initialView.workflowState?.systemLabelKey
  const detailPath = `/bokanir/${encodeURIComponent(initialView.businessProfileSlug)}/fyrirspurn/${encodeURIComponent(initialView.publicId)}`

  const activeMembers = useMemo(
    () => initialView.members.filter(member => member.status === 'active'),
    [initialView.members],
  )
  const activeOwnerCount = useMemo(
    () => activeMembers.filter(member => member.role === 'owner').length,
    [activeMembers],
  )

  useEffect(() => {
    if (providerContext || !window.location.hash) return
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    if (!fragment.has('access')) return
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }, [providerContext])

  useEffect(() => {
    // Clear a mutation envelope only after authoritative props advance. If a
    // response or refresh is lost, retrying the same intent reuses its key.
    actionEnvelope.current = null
  }, [
    initialView.accessVersion,
    initialView.lifecycleStatus,
    initialView.revision,
    workflowStateKey,
  ])

  async function runAction(payload: Record<string, unknown>, actionName: string): Promise<boolean> {
    if (mutationPending || actionInFlight.current) return false
    actionInFlight.current = true
    setPendingAction(actionName)
    setErrorKey(null)
    const semanticFingerprint = JSON.stringify(payload)
    if (!actionEnvelope.current || actionEnvelope.current.fingerprint !== semanticFingerprint) {
      try {
        actionEnvelope.current = { fingerprint: semanticFingerprint, id: newIdempotencyKey() }
      } catch {
        setErrorKey('errors.unavailable')
        setPendingAction(null)
        actionInFlight.current = false
        return false
      }
    }
    try {
      const response = await fetch(`/api/bookings/requests/${encodeURIComponent(initialView.publicId)}/actions`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey: actionEnvelope.current.id }),
      })
      const result = await response.json().catch(() => null) as BookingActionResult<unknown> | null
      if (!response.ok || !result?.ok) {
        const error = result && !result.ok ? result.error : null
        setErrorKey(error === 'conflict' ? 'errors.conflict'
          : error === 'invalid_input'
            ? 'errors.invalidInput'
            : error === 'unauthorized' || error === 'not_found'
              ? 'errors.accessChanged'
              : 'errors.saveFailed')
        if (error === 'conflict') {
          // Keep the same idempotency envelope until refreshed props advance,
          // but immediately replace stale revision/targets from the server.
          startRefreshTransition(() => {
            router.refresh()
            setPendingAction(null)
          })
        } else {
          setPendingAction(null)
        }
        return false
      }
      setClaimEmails('')
      setMemberEmail('')
      // Keep the stale controls disabled until the authoritative RSC refresh
      // commits. This also prevents a second mutation using old revisions.
      startRefreshTransition(() => {
        router.refresh()
        setPendingAction(null)
      })
      return true
    } catch {
      setErrorKey('errors.saveFailed')
      setPendingAction(null)
      return false
    } finally {
      actionInFlight.current = false
    }
  }

  function claimRequest() {
    const additionalEmails = splitEmails(claimEmails)
    if (additionalEmails.length > 9) {
      setErrorKey('claim.tooManyEmails')
      return
    }
    void runAction({
      action: 'claim',
      expectedAccessVersion: initialView.accessVersion,
      additionalEmails,
    }, 'claim')
  }

  const requestedLabel = formatRequestedBookingTime(
    initialView.requested.date,
    initialView.requested.time,
    locale,
    initialView.requested.timezone,
  )

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <div>
            <p className="text-sm text-muted-foreground">{initialView.provider.displayName}</p>
            <h2 className="mt-1 text-xl font-semibold text-primary">{initialView.service.title}</h2>
          </div>
        </div>
        <BookingStatusPanel
          audience={initialView.permissions.actorKind === 'provider' ? 'provider' : 'customer'}
          lifecycleStatus={initialView.lifecycleStatus}
          workflowState={initialView.workflowState}
          cancellationReason={initialView.cancellationReason}
          canTransition={initialView.permissions.canTransition}
          pending={mutationPending}
          onTransition={(targetStateId) => {
            void runAction({
              action: 'transitionWorkflow',
              expectedRevision: initialView.revision,
              targetStateId,
            }, `transition:${targetStateId}`)
          }}
        />
      </section>

      <section aria-labelledby="booking-request-summary" className="border-y border-border">
        <h3 id="booking-request-summary" className="sr-only">{t('detail.summary')}</h3>
        <dl className="divide-y divide-border text-sm">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3">
            <dt className="font-medium text-muted-foreground">{t('detail.requestedTime')}</dt>
            <dd className="min-w-0 break-words font-medium">{requestedLabel}</dd>
          </div>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3">
            <dt className="font-medium text-muted-foreground">{t('detail.name')}</dt>
            <dd className="min-w-0 break-words">{initialView.contact.name}</dd>
          </div>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3">
            <dt className="font-medium text-muted-foreground">{t('detail.email')}</dt>
            <dd className="min-w-0 break-all">{initialView.contact.email}</dd>
          </div>
          {initialView.contact.phone ? (
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3">
              <dt className="font-medium text-muted-foreground">{t('detail.phone')}</dt>
              <dd className="min-w-0 break-words">{initialView.contact.phone}</dd>
            </div>
          ) : null}
          <div className="grid gap-1 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3">
            <dt className="font-medium text-muted-foreground">{t('detail.message')}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words leading-6">{initialView.contact.message}</dd>
          </div>
        </dl>
      </section>

      {initialView.accessMode === 'link' ? (
        <section className="space-y-4 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-950">
          <div>
            <h3 className="font-semibold">{t('claim.linkModeTitle')}</h3>
            <p className="mt-1 text-sm leading-6">{t('claim.linkModeBody')}</p>
          </div>

          {initialView.permissions.canClaim ? (
            <div className="space-y-3 border-t border-amber-300/60 pt-4">
              <div>
                <h4 className="font-semibold">{t('claim.title')}</h4>
                <p className="mt-1 text-sm leading-6">{t('claim.warning')}</p>
              </div>
              <label className="grid gap-1 text-sm font-medium">
                {t('claim.additionalEmails')} <span className="font-normal">{t('form.optional')}</span>
                <textarea
                  value={claimEmails}
                  onChange={event => { actionEnvelope.current = null; setClaimEmails(event.target.value) }}
                  rows={2}
                  maxLength={1000}
                  placeholder={t('claim.additionalEmailsPlaceholder')}
                  disabled={mutationPending}
                  className="min-h-20 resize-y rounded-xl border border-amber-300 bg-white p-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
                />
              </label>
              <button
                type="button"
                disabled={mutationPending}
                onClick={claimRequest}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
              >
                <UserPlus aria-hidden size={17} />
                {pendingAction === 'claim' ? t('claim.claiming') : t('claim.confirm')}
              </button>
            </div>
          ) : !initialView.permissions.signedIn && initialView.lifecycleStatus === 'requested' ? (
            <BookingPendingLink
              href={`/innskraning?next=${encodeURIComponent(detailPath)}`}
              pendingLabel={t('access.openingSignIn')}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogIn aria-hidden size={17} />
              {t('claim.signIn')}
            </BookingPendingLink>
          ) : (
            <p className="text-sm leading-6">{t('claim.unavailable')}</p>
          )}
        </section>
      ) : null}

      {initialView.permissions.canManageMembers ? (
        <section aria-labelledby="booking-members-heading" className="space-y-4 border-y border-border py-5">
          <div>
            <h3 id="booking-members-heading" className="font-semibold text-primary">{t('members.title')}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('members.description')}</p>
          </div>
          <ul className="divide-y divide-border">
            {activeMembers.map(member => (
              <li key={member.id} className="flex min-w-0 items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block break-all">{member.emailCanonical}</span>
                  <span className="text-xs text-muted-foreground">{t(`members.role.${member.role}`)}</span>
                  {member.role === 'owner' && activeOwnerCount === 1 ? (
                    <span className="block text-xs text-muted-foreground">{t('members.lastOwner')}</span>
                  ) : null}
                </span>
                {!member.isSelf ? (
                  <button
                    type="button"
                    disabled={mutationPending || (member.role === 'owner' && activeOwnerCount === 1)}
                    onClick={() => void runAction({
                      action: 'revokeMember',
                      expectedAccessVersion: initialView.accessVersion,
                      memberId: member.id,
                    }, `revoke:${member.id}`)}
                    className="min-h-10 shrink-0 rounded-xl border border-border px-3 text-xs font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
                  >
                    {pendingAction === `revoke:${member.id}` ? t('members.removing') : t('members.revoke')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <label className="grid gap-1 text-sm font-medium">
              {t('members.email')}
              <input
                type="email"
                value={memberEmail}
                onChange={event => { actionEnvelope.current = null; setMemberEmail(event.target.value) }}
                maxLength={254}
                disabled={mutationPending}
                className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('members.roleLabel')}
              <select
                value={memberRole}
                onChange={event => { actionEnvelope.current = null; setMemberRole(event.target.value as 'owner' | 'member') }}
                disabled={mutationPending}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              >
                <option value="member">{t('members.role.member')}</option>
                <option value="owner">{t('members.role.owner')}</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={mutationPending || !memberEmail.trim()}
            onClick={() => void runAction({
              action: 'addMember',
              expectedAccessVersion: initialView.accessVersion,
              email: memberEmail.trim(),
              role: memberRole,
            }, 'addMember')}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-primary/20 px-4 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
          >
            {pendingAction === 'addMember' ? t('members.adding') : t('members.add')}
          </button>
        </section>
      ) : null}

      {initialView.permissions.canCancel && initialView.lifecycleStatus === 'requested' ? (
        <section className="border-y border-border py-5">
          <BookingCancellationDialog
            audience={initialView.permissions.actorKind === 'provider' ? 'provider' : 'customer'}
            pending={mutationPending}
            onConfirm={(reason) => runAction({
              action: 'cancel',
              expectedRevision: initialView.revision,
              ...(reason ? { reason } : {}),
            }, 'cancel')}
          />
        </section>
      ) : null}

      {errorKey ? <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t(errorKey)}</p> : null}

      <BookingChatPanel
        publicId={initialView.publicId}
        activity={initialView.activity}
        timeZone={initialView.requested.timezone}
        canMessage={initialView.permissions.canMessage && initialView.lifecycleStatus === 'requested'}
        audience={initialView.permissions.actorKind === 'provider' ? 'provider' : 'customer'}
      />

      {initialView.provider.websiteUrl && !providerContext ? (
        <a
          href={initialView.provider.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('providerWebsite')}
          <ExternalLink aria-hidden size={16} />
        </a>
      ) : null}
    </div>
  )
}
