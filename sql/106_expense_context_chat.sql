-- SQL106: reusable Teskeið context chat for expense items.
--
-- Extends the existing teskeid_chat_* core; it does not create an expense-
-- specific message table. Browser roles remain default-deny. All access goes
-- through server routes that re-authorize active expense membership and exact
-- thread -> expense identity on every request.
--
-- Adds durable request identifiers so ScopedChatPanel retries are idempotent.
-- No existing row is backfilled and no expense/chat content is modified.
-- Apply only after the read-only SQL106 preflight is green.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.teskeid_chat_threads') IS NULL
     OR to_regclass('public.teskeid_chat_messages') IS NULL
     OR to_regclass('public.expenses') IS NULL
     OR to_regclass('public.expense_group_members') IS NULL THEN
    RAISE EXCEPTION 'expense_context_chat_prerequisite_missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.teskeid_chat_threads AS thread
    WHERE NOT (
      thread.domain = 'weather'
      AND thread.target_type IN ('vedurstofan_station', 'vegagerdin_station')
    )
    AND NOT (
      thread.domain = 'expenses'
      AND thread.target_type = 'expense_item'
      AND thread.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  ) THEN
    RAISE EXCEPTION 'expense_context_chat_unexpected_existing_scope';
  END IF;
END;
$guard$;

ALTER TABLE public.teskeid_chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_chat_messages_client_message_unique_idx
  ON public.teskeid_chat_messages (thread_id, user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teskeid_chat_messages_idempotency_unique_idx
  ON public.teskeid_chat_messages (thread_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.teskeid_chat_threads
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_domain_check,
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_target_type_check,
  DROP CONSTRAINT IF EXISTS teskeid_chat_threads_scope_check;

ALTER TABLE public.teskeid_chat_threads
  ADD CONSTRAINT teskeid_chat_threads_scope_check
  CHECK (
    (
      domain = 'weather'
      AND target_type IN ('vedurstofan_station', 'vegagerdin_station')
    )
    OR (
      domain = 'expenses'
      AND target_type = 'expense_item'
      AND target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  ) NOT VALID;

ALTER TABLE public.teskeid_chat_threads
  VALIDATE CONSTRAINT teskeid_chat_threads_scope_check;

COMMENT ON COLUMN public.teskeid_chat_messages.client_message_id IS
  'Stable optimistic message identifier supplied by a scoped chat client.';
COMMENT ON COLUMN public.teskeid_chat_messages.idempotency_key IS
  'Retry fence scoped by thread and author; message content must match on reuse.';
COMMENT ON CONSTRAINT teskeid_chat_threads_scope_check
  ON public.teskeid_chat_threads IS
  'Closed allowlist of valid Teskeid chat domain/target pairs.';

COMMIT;

-- Recovery is intentionally separately reviewed. Removing the expense scope
-- requires first proving that no expenses/expense_item threads remain. Do not
-- drop message columns or indexes while application versions can still retry.
