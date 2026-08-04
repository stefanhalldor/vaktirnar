'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deactivateExpensePaymentPreference,
  saveExpensePaymentPreference,
} from '@/lib/expenses/actions'
import type { ExpensePaymentPreferenceView } from '@/lib/expenses/contracts'
import { EXPENSE_CURRENCIES } from '@/lib/expenses/input-money'
import type { PaymentPreferenceDetails, PaymentPreferenceKind } from '@/lib/expenses/types'
import { useExpenseTranslations } from './i18n.client'
import { useExpenseMutationRequestIds } from './request-id'
import {
  expenseDangerButtonClass,
  expenseInputClass,
  expenseLabelClass,
  expensePrimaryButtonClass,
  expenseSecondaryButtonClass,
  expenseTextareaClass,
} from './ui'

type ScopeType = 'general' | 'currency' | 'group_currency'

const KIND_KEYS: Record<PaymentPreferenceKind, string> = {
  bank_account: 'kindBank',
  payment_app_phone: 'kindPhone',
  payment_link: 'kindLink',
  cash: 'kindCash',
  other: 'kindOther',
}

function blankDetails(): PaymentPreferenceDetails {
  return {
    accountNumber: '',
    nationalId: '',
    phoneNumber: '',
    paymentLink: '',
    instructions: '',
    defaultReference: '',
  }
}

function detailsForKind(
  kind: PaymentPreferenceKind,
  details: PaymentPreferenceDetails,
): PaymentPreferenceDetails {
  const keys: Record<PaymentPreferenceKind, Array<keyof PaymentPreferenceDetails>> = {
    bank_account: ['accountNumber', 'nationalId', 'instructions', 'defaultReference'],
    payment_app_phone: ['phoneNumber', 'instructions', 'defaultReference'],
    payment_link: ['paymentLink', 'instructions'],
    cash: ['instructions'],
    other: ['instructions'],
  }
  const result: PaymentPreferenceDetails = {}
  for (const key of keys[kind]) {
    const value = details[key]?.trim()
    if (value) result[key] = value
  }
  return result
}

export function ExpensePaymentPreferences({
  preferences,
  groups,
}: {
  preferences: ExpensePaymentPreferenceView[]
  groups: Array<{ id: string; name: string }>
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const requestIds = useExpenseMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [editing, setEditing] = useState<ExpensePaymentPreferenceView | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<PaymentPreferenceKind>('bank_account')
  const [details, setDetails] = useState<PaymentPreferenceDetails>(blankDetails)
  const [visibility, setVisibility] = useState<'private' | 'debt_context'>('private')
  const [allCurrencies, setAllCurrencies] = useState(true)
  const [currencies, setCurrencies] = useState<string[]>(['ISK'])
  const [scope, setScope] = useState<ScopeType>('general')
  const [scopeCurrency, setScopeCurrency] = useState('ISK')
  const [scopeGroupId, setScopeGroupId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    requestIds.reset()
    setEditing(null)
    setTitle('')
    setKind('bank_account')
    setDetails(blankDetails())
    setVisibility('private')
    setAllCurrencies(true)
    setCurrencies(['ISK'])
    setScope('general')
    setScopeCurrency('ISK')
    setScopeGroupId('')
    setError(null)
  }

  function edit(preference: ExpensePaymentPreferenceView) {
    const assignment = preference.assignments[0]
    setEditing(preference)
    setTitle(preference.title)
    setKind(preference.kind)
    setDetails({ ...blankDetails(), ...preference.details })
    setVisibility(preference.visibility === 'private' ? 'private' : 'debt_context')
    setAllCurrencies(preference.supportedCurrencies === null)
    setCurrencies(preference.supportedCurrencies ?? ['ISK'])
    setScope(assignment?.scopeType ?? 'general')
    setScopeCurrency(assignment?.currency ?? preference.supportedCurrencies?.[0] ?? 'ISK')
    setScopeGroupId(assignment?.groupId ?? '')
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateDetail(key: keyof PaymentPreferenceDetails, value: string) {
    setDetails((current) => ({ ...current, [key]: value }))
  }

  function toggleCurrency(currency: string) {
    setCurrencies((current) => current.includes(currency)
      ? current.filter((item) => item !== currency)
      : [...current, currency])
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!allCurrencies && currencies.length === 0) {
      setError(t('preferences.currencyRequired'))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    if (!allCurrencies && scope !== 'general' && !currencies.includes(scopeCurrency)) {
      setError(t('preferences.assignmentCurrencyRequired', { currency: scopeCurrency }))
      queueMicrotask(() => alertRef.current?.focus())
      return
    }
    const assignment = scope === 'general'
      ? { scope_type: 'general' as const }
      : scope === 'currency'
        ? { scope_type: 'currency' as const, currency: scopeCurrency }
        : { scope_type: 'group_currency' as const, currency: scopeCurrency, group_id: scopeGroupId }
    const payload = {
      preference_id: editing?.id ?? null,
      expected_version: editing?.version ?? null,
      title,
      kind,
      supported_currencies: allCurrencies ? null : currencies,
      details: detailsForKind(kind, details),
      visibility,
      assignment,
    }
    setError(null)
    setPendingId(editing?.id ?? 'new')
    startTransition(async () => {
      const result = await saveExpensePaymentPreference({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setPendingId(null)
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      reset()
      router.refresh()
    })
  }

  function deactivate(preference: ExpensePaymentPreferenceView) {
    if (!window.confirm(t('preferences.deactivateConfirm', { name: preference.title }))) return
    setError(null)
    setPendingId(preference.id)
    const payload = {
      preference_id: preference.id,
      expected_version: preference.version,
    }
    startTransition(async () => {
      const result = await deactivateExpensePaymentPreference({
        ...payload,
        request_id: requestIds.forPayload(payload),
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        setPendingId(null)
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      requestIds.succeeded(payload)
      if (editing?.id === preference.id) reset()
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-muted-foreground">{t('preferences.intro')}</p>

      <form onSubmit={submit} className="space-y-5 border-y border-border py-5">
        <h2 className="text-sm font-semibold">{editing ? t('preferences.edit') : t('preferences.new')}</h2>
        {error ? <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <label>
          <span className={expenseLabelClass}>{t('preferences.name')}</span>
          <input className={expenseInputClass} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
        </label>
        <label>
          <span className={expenseLabelClass}>{t('preferences.kind')}</span>
          <select className={expenseInputClass} value={kind} onChange={(event) => setKind(event.target.value as PaymentPreferenceKind)}>
            {(Object.keys(KIND_KEYS) as PaymentPreferenceKind[]).map((item) => <option key={item} value={item}>{t(`preferences.${KIND_KEYS[item]}`)}</option>)}
          </select>
        </label>

        {kind === 'bank_account' ? (
          <>
            <label><span className={expenseLabelClass}>{t('preferences.accountNumber')}</span><input className={expenseInputClass} value={details.accountNumber ?? ''} onChange={(event) => updateDetail('accountNumber', event.target.value)} maxLength={80} required /></label>
            <label><span className={expenseLabelClass}>{t('preferences.nationalId')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><input className={expenseInputClass} value={details.nationalId ?? ''} onChange={(event) => updateDetail('nationalId', event.target.value)} maxLength={32} /></label>
          </>
        ) : null}
        {kind === 'payment_app_phone' ? <label><span className={expenseLabelClass}>{t('preferences.phoneNumber')}</span><input className={expenseInputClass} value={details.phoneNumber ?? ''} onChange={(event) => updateDetail('phoneNumber', event.target.value)} maxLength={40} required /></label> : null}
        {kind === 'payment_link' ? <label><span className={expenseLabelClass}>{t('preferences.paymentLink')}</span><input className={expenseInputClass} type="url" inputMode="url" value={details.paymentLink ?? ''} onChange={(event) => updateDetail('paymentLink', event.target.value)} maxLength={500} pattern="https://.*" required /></label> : null}
        {kind !== 'payment_link' && kind !== 'cash' && kind !== 'other' ? <label><span className={expenseLabelClass}>{t('preferences.reference')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></span><input className={expenseInputClass} value={details.defaultReference ?? ''} onChange={(event) => updateDetail('defaultReference', event.target.value)} maxLength={200} /></label> : null}
        <label><span className={expenseLabelClass}>{t('preferences.instructions')} {kind === 'other' ? null : <span className="font-normal text-muted-foreground">({t('common.optional')})</span>}</span><textarea className={expenseTextareaClass} value={details.instructions ?? ''} onChange={(event) => updateDetail('instructions', event.target.value)} maxLength={1000} required={kind === 'other'} /></label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t('preferences.currencies')}</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={allCurrencies} onChange={(event) => setAllCurrencies(event.target.checked)} />{t('preferences.allCurrencies')}</label>
          {!allCurrencies ? <div className="grid grid-cols-3 gap-2">{EXPENSE_CURRENCIES.map((currency) => <label key={currency} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={currencies.includes(currency)} onChange={() => toggleCurrency(currency)} />{currency}</label>)}</div> : null}
        </fieldset>

        <label><span className={expenseLabelClass}>{t('preferences.visibility')}</span><select className={expenseInputClass} value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'debt_context')}><option value="private">{t('preferences.private')}</option><option value="debt_context">{t('preferences.debtContext')}</option></select></label>
        {visibility === 'private' ? <p className="text-xs leading-5 text-muted-foreground">{t('preferences.privateScopeHint')}</p> : null}
        <label><span className={expenseLabelClass}>{t('preferences.scope')}</span><select className={expenseInputClass} value={scope} onChange={(event) => setScope(event.target.value as ScopeType)}><option value="general">{t('preferences.scopeGeneral')}</option><option value="currency">{t('preferences.scopeCurrency')}</option>{groups.length > 0 ? <option value="group_currency">{t('preferences.scopeGroup')}</option> : null}</select></label>
        {scope !== 'general' ? <label><span className={expenseLabelClass}>{t('common.currency')}</span><select className={expenseInputClass} value={scopeCurrency} onChange={(event) => setScopeCurrency(event.target.value)}>{EXPENSE_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label> : null}
        {scope === 'group_currency' ? <label><span className={expenseLabelClass}>{t('preferences.group')}</span><select className={expenseInputClass} value={scopeGroupId} onChange={(event) => setScopeGroupId(event.target.value)} required><option value="">{t('preferences.chooseGroup')}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="submit" className={expensePrimaryButtonClass} disabled={isPending}>{isPending && (pendingId === 'new' || pendingId === editing?.id) ? t('preferences.saving') : t('preferences.save')}</button>
          {editing ? <button type="button" className={expenseSecondaryButtonClass} disabled={isPending} onClick={reset}>{t('preferences.cancelEdit')}</button> : null}
        </div>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold">{t('preferences.saved')}</h2>
        {preferences.length === 0 ? <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('preferences.empty')}</p> : (
          <div className="divide-y divide-border border-y border-border">
            {preferences.map((preference) => (
              <div key={preference.id} className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{preference.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{t(`preferences.${KIND_KEYS[preference.kind]}`)} · {t(preference.visibility === 'private' ? 'preferences.private' : 'preferences.debtContext')}{preference.active ? '' : ` · ${t('preferences.inactive')}`}</p></div>
                  <span className="max-w-[45%] break-words text-right text-xs text-muted-foreground">{preference.supportedCurrencies?.join(', ') || t('preferences.allCurrencies')}</span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{t('preferences.detailsMasked')}</p>
                {preference.active ? <div className="grid grid-cols-2 gap-2"><button type="button" className={expenseSecondaryButtonClass} disabled={isPending} onClick={() => edit(preference)}>{t('preferences.edit')}</button><button type="button" className={expenseDangerButtonClass} disabled={isPending} onClick={() => deactivate(preference)}>{isPending && pendingId === preference.id ? t('preferences.deactivating') : t('preferences.deactivate')}</button></div> : null}
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">{t('preferences.snapshotHint')}</p>
    </div>
  )
}
