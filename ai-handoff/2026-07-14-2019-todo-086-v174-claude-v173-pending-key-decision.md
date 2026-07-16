# TODO 086 v174 - Claude Code handoff: pending provider key decision

Created: 2026-07-14 22:00:00 +00:00
Timezone: Atlantic/Reykjavik

Source handoffs reviewed:
- `ai-handoff/2026-07-14-2008-todo-086-v172-codex-v171-flag-contract-review.md`
- `ai-handoff/2026-07-14-2010-todo-086-v173-codex-v172-correction-keep-vedurstofan-per-user.md`

Mode:
- Handoff only. No code, SQL, migration, commit, push, or Supabase action was performed.

## Staða

### v172 vs v173

v172 (Codex) mistakenly recommended opening Veðurstofan globally. That was based on a misread of Stebbi's direction.

v173 (Codex) corrects this:
- Veðurstofan stays behind per-user feature access for now.
- v171 is directionally correct in keeping it per-user.
- The only open question is the naming of the feature key.

### v171 er rétt — nema nafnið

v171 code (already in the working tree) is correct in every way except potentially the key name:
- `extra-weather-providers` as a generic umbrella key
- `WEATHER_EXTRA_PROVIDERS_FLAG` as the kill switch

This works. The concern is that when Vegagerðin comes, a user granted `extra-weather-providers` would automatically get both providers, making per-provider control harder.

## Óleyst: Stebbi þarf að velja

### Valkostur A — Preferred (Codex mælist með)

Rename now, before SQL is ever run in production:

| Current (v171) | New |
|---|---|
| `extra-weather-providers` | `weather-provider-vedurstofan` |
| `WEATHER_EXTRA_PROVIDERS_FLAG` | `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` |

Migration 76 revised to add `weather-provider-vedurstofan` instead.

Later, Vegagerðin gets its own key: `weather-provider-vegagerdin` + `WEATHER_PROVIDER_VEGAGERDIN_ENABLED`.

Each provider has independent on/off control at both env level and per-user level.

### Valkostur B — Acceptable short-term

Keep v171 as-is (`extra-weather-providers`, `WEATHER_EXTRA_PROVIDERS_FLAG`). Document that it means Veðurstofan-only for now. Revisit when Vegagerðin is approaching.

Migration 76 runs as currently written.

## Hvað þarf Stebbi að segja

Either:
- "A" — Claude Code renames key + env var + sql/76 + tests, writes new handoff.
- "B" — Claude Code documents the short-term intent and confirms v171 is ready to release as-is, writes new handoff.

## Engar aðrar óleysanlegrar spurningar

- Veðurstofan persists as per-user — confirmed (v173).
- `elta-vedrid` kept for station validator/explorer route — no change needed.
- SQL migration 76 not run until Stebbi explicitly approves Supabase execution — regardless of which path is chosen.
- No new env vars set in Vercel or `.env` by Claude Code.
