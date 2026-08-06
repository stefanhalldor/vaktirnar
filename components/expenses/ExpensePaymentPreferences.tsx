'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  clearExpensePaymentProfileV2,
  saveExpensePaymentProfileV2,
} from '@/lib/expenses/actions'
import type { ExpensePaymentProfileV2View } from '@/lib/expenses/contracts'
import {
  PAYMENT_BANK_PART_LENGTHS,
  formatExpenseBankAccount,
  formatExpenseBankAccountDraft,
  formatExpenseNationalIdDraft,
  normalizeExpensePaymentProfile,
} from '@/lib/expenses/payment-profile'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseDangerButtonClass,
  expenseInputClass,
  expenseLabelClass,
  expensePrimaryButtonClass,
  expenseTextareaClass,
} from './ui'

export function ExpensePaymentPreferences({
  profile,
}: {
  profile: ExpensePaymentProfileV2View
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [bank, setBank] = useState(profile.details?.bank ?? '')
  const [ledger, setLedger] = useState(profile.details?.ledger ?? '')
  const [account, setAccount] = useState(profile.details?.account ?? '')
  const [nationalId, setNationalId] = useState(profile.details?.nationalId ?? '')
  const [other, setOther] = useState(profile.details?.other ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function setDigits(setter: (value: string) => void, value: string, maxLength: number) {
    setter(value.replace(/\D/g, '').slice(0, maxLength))
    setSaved(false)
    setError(null)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const normalized = normalizeExpensePaymentProfile({
      bank,
      ledger,
      account,
      nationalId,
      other,
    })
    if (!normalized.ok) {
      setError(t(`preferences.${normalized.error}`))
      setSaved(false)
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    const payload = {
      profile_id: profile.id,
      expected_version: profile.version,
      bank,
      ledger,
      account,
      national_id: nationalId,
      other,
    }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveExpensePaymentProfileV2({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(result.error === 'feature_disabled'
          ? 'preferences.cryptoUnavailable'
          : 'preferences.invalidProfile'))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      setBank(normalized.value.bank ?? '')
      setLedger(normalized.value.ledger ?? '')
      setAccount(normalized.value.account ?? '')
      setNationalId(normalized.value.nationalId ?? '')
      setOther(normalized.value.other ?? '')
      setSaved(true)
      router.push('/auth-mvp/utlagt-og-endurgreitt')
    })
  }

  function clearProfile() {
    if (!profile.id || !profile.version || !window.confirm(t('preferences.clearConfirm'))) return
    const payload = { profile_id: profile.id, expected_version: profile.version }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await clearExpensePaymentProfileV2({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t('errors.save_failed'))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      setBank('')
      setLedger('')
      setAccount('')
      setNationalId('')
      setOther('')
      router.refresh()
    })
  }

  const formattedAccount = formatExpenseBankAccount({
    bank: bank || null,
    ledger: ledger || null,
    account: account || null,
  })
  const draftAccount = formatExpenseBankAccountDraft({ bank, ledger, account })
  const disabled = isPending || !profile.storageReady || !profile.cryptoReady || profile.decryptFailed

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted-foreground">{t('preferences.simpleIntro')}</p>

      {!profile.storageReady ? (
        <p ref={alertRef} tabIndex={-1} role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t('preferences.storageUnavailable')}
        </p>
      ) : null}
      {profile.storageReady && !profile.cryptoReady ? (
        <p ref={alertRef} tabIndex={-1} role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t('preferences.cryptoUnavailable')}
        </p>
      ) : null}
      {profile.decryptFailed ? (
        <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {t('preferences.decryptFailed')}
        </p>
      ) : null}
      {profile.legacyActiveCount > 0 || profile.legacySnapshotCount > 0 ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <p className="font-medium">{t('preferences.legacyTitle')}</p>
          <p>{profile.legacyNeedsChoice
            ? t('preferences.legacyMultiple')
            : t('preferences.legacyReenter')}</p>
        </div>
      ) : null}
      {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-primary">{t('preferences.savedSimple')}</p> : null}

      <form onSubmit={submit} className="space-y-6 border-y border-border py-5">
        <fieldset className="space-y-3" disabled={disabled}>
          <legend className="text-sm font-semibold">{t('preferences.bankAccount')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></legend>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,.6fr)_minmax(0,1.35fr)] gap-2">
            <label className="min-w-0">
              <span className={expenseLabelClass}>{t('preferences.bank')}</span>
              <input className={expenseInputClass} inputMode="numeric" autoComplete="off" value={bank} onChange={(event) => setDigits(setBank, event.target.value, PAYMENT_BANK_PART_LENGTHS.bank)} aria-describedby="payment-account-preview" />
            </label>
            <label className="min-w-0">
              <span className={expenseLabelClass}>{t('preferences.ledger')}</span>
              <input className={expenseInputClass} inputMode="numeric" autoComplete="off" value={ledger} onChange={(event) => setDigits(setLedger, event.target.value, PAYMENT_BANK_PART_LENGTHS.ledger)} aria-describedby="payment-account-preview" />
            </label>
            <label className="min-w-0">
              <span className={expenseLabelClass}>{t('preferences.account')}</span>
              <input className={expenseInputClass} inputMode="numeric" autoComplete="off" value={account} onChange={(event) => setDigits(setAccount, event.target.value, PAYMENT_BANK_PART_LENGTHS.account)} aria-describedby="payment-account-preview" />
            </label>
          </div>
          <p id="payment-account-preview" className="text-xs text-muted-foreground">
            {formattedAccount ?? draftAccount ?? t('preferences.accountFormat')}
          </p>
        </fieldset>

        <label>
          <span className={expenseLabelClass}>{t('preferences.nationalId')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span>
          <input className={expenseInputClass} inputMode="numeric" autoComplete="off" value={formatExpenseNationalIdDraft(nationalId)} onChange={(event) => setDigits(setNationalId, event.target.value, 10)} disabled={disabled} />
        </label>

        <label>
          <span className={expenseLabelClass}>{t('preferences.other')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span>
          <textarea className={expenseTextareaClass} value={other} onChange={(event) => { setOther(event.target.value); setSaved(false); setError(null) }} maxLength={1000} disabled={disabled} />
          <span className="mt-1 block text-xs text-muted-foreground">{t('preferences.otherHint')}</span>
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="submit" className={expensePrimaryButtonClass} disabled={disabled}>
            {isPending ? t('preferences.saving') : t('preferences.save')}
          </button>
          {profile.id ? (
            <button type="button" className={expenseDangerButtonClass} disabled={disabled} onClick={clearProfile}>
              {t('preferences.clear')}
            </button>
          ) : null}
        </div>
      </form>

      <div className="space-y-2 text-xs leading-5 text-muted-foreground">
        <p>{t('preferences.debtorsCanSee')}</p>
        {profile.storageReady && profile.cryptoReady && !profile.decryptFailed
          && profile.legacyActiveCount === 0 && profile.legacySnapshotCount === 0
          ? <p>{t('preferences.encryptedAtRest')}</p>
          : null}
      </div>
    </div>
  )
}
