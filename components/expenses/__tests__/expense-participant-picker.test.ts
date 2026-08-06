import { describe, expect, it } from 'vitest'
import { classifyManualExpenseParticipant } from '../ExpenseParticipantPicker'

describe('unified expense participant input', () => {
  it('classifies a plain name as a durable guest participant', () => {
    expect(classifyManualExpenseParticipant('  Greta Jóns  ')).toEqual({
      kind: 'guest',
      displayName: 'Greta Jóns',
    })
  })

  it('canonicalizes an email and rejects malformed email-like input', () => {
    expect(classifyManualExpenseParticipant(' GRETA@EXAMPLE.IS ')).toEqual({
      kind: 'email',
      recipientEmail: 'greta@example.is',
    })
    expect(classifyManualExpenseParticipant('greta@')).toBeNull()
    expect(classifyManualExpenseParticipant('')).toBeNull()
  })
})
