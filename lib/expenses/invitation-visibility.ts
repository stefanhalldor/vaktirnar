export function expenseInvitationRecipientProjection(input: {
  canManage: boolean
  isEventDerivedMember: boolean
  recipientEmail: string
}): { recipientLabel?: string } {
  if (!input.canManage || input.isEventDerivedMember) return {}
  return { recipientLabel: input.recipientEmail }
}
