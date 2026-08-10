-- Manual function-only rollback. Run only after reviewing why SQL121 must be reverted.
-- No ledger rows are deleted or updated.
BEGIN;
REVOKE ALL ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid);
ALTER FUNCTION public.expense_respond_scoped_member_invitation_v120(uuid,uuid,text,uuid)
  RENAME TO expense_respond_scoped_member_invitation;
REVOKE ALL ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expense_respond_scoped_member_invitation(uuid,uuid,text,uuid)
  TO service_role;
DROP FUNCTION public.expense_get_scoped_member_invitation_preview(uuid,uuid);
DROP FUNCTION public.expense_member_invitation_exact_expense(uuid);
COMMIT;
