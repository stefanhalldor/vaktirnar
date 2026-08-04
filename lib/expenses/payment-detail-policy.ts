import type { PaymentPreferenceDetails, PaymentPreferenceKind } from './types'

export const PAYMENT_DETAIL_KEYS_BY_KIND: Readonly<
  Record<PaymentPreferenceKind, readonly (keyof PaymentPreferenceDetails)[]>
> = Object.freeze({
  bank_account: ['accountNumber', 'nationalId', 'instructions', 'defaultReference'],
  payment_app_phone: ['phoneNumber', 'instructions', 'defaultReference'],
  payment_link: ['paymentLink', 'instructions'],
  cash: ['instructions'],
  other: ['instructions'],
})
