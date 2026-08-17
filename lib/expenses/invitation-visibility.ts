export function expenseInvitationRecipientProjection(input: {
  canManage: boolean
  recipientEmail: string
}): { recipientLabel?: string } {
  if (!input.canManage) return {}
  const canonical = input.recipientEmail.trim().toLowerCase()
  if (canonical.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonical)) return {}
  const separator = canonical.indexOf('@')
  return { recipientLabel: `${canonical[0]}***@${canonical.slice(separator + 1)}` }
}
