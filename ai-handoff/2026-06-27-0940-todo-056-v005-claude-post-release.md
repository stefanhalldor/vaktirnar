# #56 v005 - Post-release handoff

**TODO:** #56 - Breyta lánsdagsetningu og skiladegi á samþykktum lánum

**Agent:** Claude Code

**Staða:** Gefið út. Commit `078c60f` á `main`, pushað á Vercel. Stebbi staðfesti localhost.

---

## Hvað fór í þennan release

- **SQL58**: `update_loan_item_details_and_dates_with_diff` - nýtt RPC sem leyfir `created_by`, `lender_user_id` og `borrower_user_id` að breyta `item_name`, `note`, `loaned_at` og `due_at`.
- **Schema**: `EditLoanItemDetailsSchema` fær `loaned_at` (required) og `due_at` (optional).
- **Action**: `updateLoanItemDetails` kallar á SQL58, diff-ar dates, skráir events.
- **Controls**: `canEditItemDetails` er nú `true` fyrir accepted borrower.
- **Form**: `LoanItemDetailsForm` fær date inputs.
- **Prófanir**: 1309 standast.

---

## Verkefni fyrir Codex

### 1. Færa #56 í DONE

**Tillaga:**

```md
#56 - Breyta lánsdagsetningu og skiladegi á samþykktum lánum

Lokið: 2026-06-27

- Báðir aðilar að samþykktu láni (lánveitandi og lántakandi) geta breytt
  item_name, note, loaned_at og due_at í einni edit-mynd.
- SQL58 (update_loan_item_details_and_dates_with_diff) heimild: created_by,
  lender_user_id eða borrower_user_id. Pending recipient fær not_found.
- Notar p_actor_id (ekki auth.uid()) og date (ekki timestamptz).
- Breytingar birtast í Ólesið hjá mótaðila: Breytt lánsdagsetning /
  Breyttur skiladagur.
- Stebbi staðfesti localhost 2026-06-27.

Follow-up: #58 (ferill hlutar á detail-síðu).
```

### 2. Staðfesta Vercel build

Eftir push á `main` skoða Vercel build log og staðfesta að deploy hafi tekist.

---

## Localhost checks - staðfesting Stebba

Stebbi staðfesti localhost fyrir release:
- Lánveitandi getur breytt dagsetningum á samþykktu láni.
- Lántakandi getur breytt dagsetningum.
- Mótaðili fær events í Ólesið.

---

## Næstu skref

**#58 - Ferill hlutar á detail-síðu** er næsta atriði í Pakka A.

Tæknilegar athugasemdir úr v003 Codex-rýni:
- Nota `recent_events` með de-duplicate eftir `event_key`.
- Actor getur verið óþekktur á eldri events - sýna action án actor, giska ekki.
- Nýtt service-role RPC: `get_loan_event_history(p_actor_id uuid, p_loan_id uuid)`.
- Section birtist neðst á `/auth-mvp/lanad-og-skilad/[id]`.
