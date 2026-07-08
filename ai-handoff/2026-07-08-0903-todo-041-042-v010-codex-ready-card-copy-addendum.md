# TODO-041/042 v010 - Codex ready card copy addendum

Created: 2026-07-08 09:03
Timezone: Atlantic/Reykjavik
Author: Codex
Status: Addendum to v009 and v181 context. Do not run SQL #70 until Stebbi approves final card copy.

Context:
- Stebbi noted after v181/v009 that the ready-card texts were meant to be shorter.
- Especially:
  - Veðrið had already been moved toward a much shorter card text.
  - Umönnun still needs to be shortened from the long text:
    `Tól fyrir umönnunarhringi, ættingja, vini og nágranna sem halda utan um umönnunina saman. Hannað fyrir þann raunverulega og oft flókna veruleika sem fylgir því þegar margir þurfa að láta hlutina ganga upp í sameiningu.`
- Per workflow, Codex is not editing v181/v009 directly. This file is the follow-up addendum.

## Finding

### Medium - Ready-card copy is not final; SQL #70 should not be run yet

The `ReadyTeskeidCard` layout review in v009 is still okay, but the copy update in `sql/70_update_ready_card_descriptions.sql` needs one more Stebbi decision before it is run.

The screenshot Stebbi sent shows the cards still rendering older/longer DB copy. That is expected if SQL #70 has not been run locally/prod, but it also makes the copy review visible:

- `Lánað og skilað` should stay short.
- `Veðrið` should use the short travel-weather summary, not the older long "Veður sem svarar..." text.
- `Umönnun` should be shortened before SQL #70 is treated as ready.

## Recommended Final Copy For SQL #70

Use this as the next Claude Code target unless Stebbi changes wording:

```sql
UPDATE ideas
SET short_description = 'Haltu utan um hluti sem þú lænar eða færð lánaða.'
WHERE slug = 'lanad-og-skilad';

UPDATE ideas
SET short_description = 'Ferðaveður byggt á leið, tíma og veðurspá.'
WHERE slug = 'vedrid';

UPDATE ideas
SET short_description = 'Fyrir fólk sem heldur umönnuninni gangandi saman.'
WHERE slug = 'umonnun';
```

Notes:

- The Veðrið line is intentionally short and product-like.
- The Umönnun line removes the long explanation and keeps the collaborative care idea.
- If Stebbi wants to preserve "ættingja, vini og nágranna", an alternative is:
  `Fyrir ættingja, vini og nágranna sem halda umönnuninni gangandi saman.`
- Codex preference: use the shorter `Fyrir fólk sem heldur umönnuninni gangandi saman.` for the compact card, because the card already sits under "Tilbúnar Teskeiðar" and does not need to explain the whole product.

## Suggested Claude Code Scope

1. Update only `sql/70_update_ready_card_descriptions.sql` copy.
2. Do not change the card layout unless Stebbi separately requests it.
3. Do not run SQL.
4. Do not change RLS, grants, auth, Supabase functions, or migrations other than the SQL #70 text.
5. If tests are run, a full type-check is enough unless code changes are made.

## Localhost Checks for Stebbi

After Claude Code updates SQL #70 and Stebbi runs it locally:

1. Open `/auth-mvp/heim`.
2. Confirm `Lánað og skilað` text is short and does not wrap into a long paragraph.
3. Confirm `Veðrið` says: `Ferðaveður byggt á leið, tíma og veðurspá.`
4. Confirm `Umönnun` uses the approved short text.
5. Confirm all three cards still fit at 360px width with no horizontal overflow or overlap.

Do not run SQL #70 against production until Stebbi explicitly approves the final copy and migration run.

## Commands Run

Read-only commands:

- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
- `rg --files ai-handoff | rg "todo-041-042-v010|ready-card-copy|todo-067-v182|v181"`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0901-todo-041-042-v009-codex-ready-card-polish-review.md'`
- `Get-Content -Encoding UTF8 'ai-handoff\\2026-07-08-0901-todo-067-v181-codex-v180-prerelease-review.md'`

## Files Changed By Codex

- `ai-handoff/2026-07-08-0903-todo-041-042-v010-codex-ready-card-copy-addendum.md`

No app code, SQL content, migration run, Supabase data, commit, push, or deploy was changed by Codex.

## Óvissa / Þarf Að Staðfesta

Stebbi should confirm the exact Umönnun sentence. Codex recommends the shortest line above, but this is product voice/copy, not a technical requirement.
