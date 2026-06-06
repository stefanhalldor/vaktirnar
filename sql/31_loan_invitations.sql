-- Feature: Lánað og skilað — loan_invitations table
-- Dependency: 30_loan_items.sql must be applied first.

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE public.loan_invitations (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id                    uuid        NOT NULL
                               REFERENCES public.loan_items(id) ON DELETE CASCADE,
  recipient_role             text        NOT NULL
                               CHECK (recipient_role IN ('lender', 'borrower')),
  recipient_email_normalized text        NOT NULL
                               CHECK (
                                 char_length(recipient_email_normalized) > 0
                                 AND char_length(recipient_email_normalized) <= 320
                               ),
  invited_by                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status                     text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN (
                                 'pending', 'accepted', 'declined',
                                 'cancelled', 'expired'
                               )),

  -- Email attempt state machine
  -- attempt_number: current attempt (0 = no send attempted yet)
  -- attempt_status: 'reserved' after reserve_invitation_send;
  --                 'sent' after confirmed Resend delivery;
  --                 'failed' after definitive Resend failure
  -- attempt_at:     when current attempt was created or last updated
  -- email_sent_at:  set only after the first confirmed delivery
  attempt_number  int         NOT NULL DEFAULT 0
                    CHECK (attempt_number >= 0),
  attempt_status  text
                    CHECK (attempt_status IS NULL
                        OR attempt_status IN ('reserved', 'sent', 'failed')),
  attempt_at      timestamptz,
  email_sent_at   timestamptz,

  expires_at      timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Table-level constraint so both columns are fully defined before the check
  CONSTRAINT loan_invitations_expiry_after_created CHECK (expires_at > created_at)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- At most one active (pending or accepted) invitation per loan per role
CREATE UNIQUE INDEX loan_invitations_active_idx
  ON public.loan_invitations (loan_id, recipient_role)
  WHERE status IN ('pending', 'accepted');

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================

CREATE TRIGGER loan_invitations_updated_at
  BEFORE UPDATE ON public.loan_invitations
  FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();

-- ============================================================
-- RLS AND GRANTS
-- No direct authenticated access — service_role RPCs only.
-- ============================================================

ALTER TABLE public.loan_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loan_invitations FROM PUBLIC, anon, authenticated;
-- service_role requires explicit table privileges even though it bypasses RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_invitations TO service_role;
