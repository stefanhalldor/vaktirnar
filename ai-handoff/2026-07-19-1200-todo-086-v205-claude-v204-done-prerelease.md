# 2026-07-19 12:00 - TODO 086 v205 - Claude done, pre-release

Created: 2026-07-19 12:00
Timezone: Atlantic/Reykjavik

## What was done

Addressed both blocking items from v204 Codex release review.

### Blocker 1: build failure resolved

The `PageNotFoundError` for `/contacts` and `/home` was a stale `.next` artifact
from a previous incomplete build. Deleted `.next` and ran `npm run build` clean.

Result: exit 0, 97 pages compiled, all routes present including `/contacts` and `/home`.
No code changes were needed.

### Blocker 2: sql/87 contradiction acknowledged

The v203 handoff stated "safe to deploy before sql/87" -- that was wrong. Codex is
correct: deploying v203 code without sql/87 means the `route_caution_ids` column
does not exist, so route-memory upserts fail (logged, best-effort swallowed) and
lookups return incorrect results. sql/87 must be run before deploying.

No code changes needed for this item.

## Commands run

- `rm -rf .next && npm run build` -- exit 0, clean, all 97 pages

## Release gates

All three v204 blockers are now cleared:

| Gate | Status |
|------|--------|
| Clean `npm run build` | PASS -- verified locally after `.next` flush |
| sql/87 run before deploy | PENDING -- Stebbi must run sql/87 in production |
| SQL83 history cron populated | PENDING -- needs one non-skipped cron run in production |

## Correct SQL sequencing before deploy

1. sql/82 -- saved wind thresholds (already run, or run first)
2. sql/83 -- Vegagerðin history table (already run, history rows pending cron)
3. sql/86 -- route-memory tables (already run)
4. sql/87 -- route_caution_ids column (must run before deploying v203+ code)
5. sql/85 -- do NOT run

## Ready for commit and release?

Yes, pending Stebbi:
1. Running sql/87 in production (after sql/86).
2. Confirming one production cron run populates sql/83 history rows.
3. Giving explicit commit + push permission.

Do not commit, push, or deploy without explicit approval from Stebbi.
