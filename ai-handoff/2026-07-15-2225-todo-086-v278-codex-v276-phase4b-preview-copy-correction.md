# 2026-07-15 22:25 - TODO-086 v278 - Codex addendum: Veðurpúls preview + copy correction

Created: 2026-07-15 22:25
Timezone: Atlantic/Reykjavik

This is an addendum to:

- `2026-07-15-2219-todo-086-v276-claude-open-by-default-no-flash-done.md`
- `2026-07-15-2221-todo-086-v277-codex-v276-open-default-review.md`
- `2026-07-15-2211-todo-086-v275-codex-v274-phase4b-interpretation-review.md`

This is review/planning only. No code, SQL, env, commit, push, deploy, or production action was performed.

## Product correction

Stebbi is right: the final station-card experience should not be an always-open full inline chat.

The current v276 "open by default" behavior is acceptable only as a temporary Phase 4A testing state. The Phase 4B product shape should be:

1. Station card shows only the latest 3 pulse messages.
2. Station card has a clear action: `Opna púlsinn`.
3. Clicking it opens the station pulse on its own URL, for example:

```text
/auth-mvp/vedrid/puls/stod/[stationId]
```

4. The full pulse URL contains the full reusable chat panel, not the station card.
5. The station card preview must not include the send input.
6. The station card preview must not cause layout jumping when messages refresh.

In other words:

- `ScopedChatPanel` remains the reusable full Chat core.
- `ChatPreviewList` or equivalent becomes the reusable latest-N preview core.
- Veðurpúls wrapper owns the weather route, station context, and copy.
- The station card uses preview + route link.
- The full route uses `ScopedChatPanel pageSize={50}`.

## Why this is better

This keeps the route/weather page focused on weather context and avoids turning every station card into a full chat surface. It also gives each station pulse a stable direct URL that can be shared, opened after login, and reused later for Vegagerðin/current-condition points.

## Copy changes requested by Stebbi

Change Icelandic copy:

```json
"pulseEmpty": "Engar umferðarfréttir ennþá. Vertu fyrst/ur til að deila þinni upplifun af aðstæðunum.",
"pulseInputPlaceholder": "Hjálpaðu öðrum með því að deila þinni upplifun af aðstæðunum"
```

Recommended English equivalents:

```json
"pulseEmpty": "No traffic reports yet. Be the first to share your experience of the conditions.",
"pulseInputPlaceholder": "Help others by sharing your experience of the conditions"
```

Also add a separate label for the station-card preview action instead of reusing `pulseOpen` if needed:

```json
"pulseOpenFull": "Opna púlsinn"
```

English:

```json
"pulseOpenFull": "Open the pulse"
```

Do not use `pulseOpen` for both the section title and route action if that makes the UI text ambiguous.

## Instruction to Claude Code

Use this as the next implementation direction:

```text
Claude Code: v276 is okay as temporary Phase 4A behavior, but do not treat always-open inline chat as the final product shape.

For Phase 4B:
1. Replace the full inline station-card chat with a latest-3 preview.
2. Add "Opna púlsinn" as the action to the route-backed station pulse page.
3. Keep send input only on the full station pulse route, not on the station card.
4. Keep the preview generic through reusable Chat components. Do not create a weather-only duplicate list renderer if ChatPreviewList can do it.
5. Update `pulseEmpty` and `pulseInputPlaceholder` copy in both `messages/is.json` and `messages/en.json`.
6. Keep `ScopedChatPanel` as generic reusable Chat core; Veðurpúls remains only the weather/product adapter.
```

## Localhost checks for Stebbi

After Phase 4B:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Select a Veðurstofan station with existing pulse messages.
3. Expected: station card shows max 3 latest pulse messages.
4. Expected: no input box appears on the station card.
5. Click `Opna púlsinn`.
6. Expected: URL changes to `/auth-mvp/vedrid/puls/stod/[stationId]`.
7. Expected: full route shows station context and the reusable full chat panel.
8. On a station with no messages, expected empty copy:
   - `Engar umferðarfréttir ennþá. Vertu fyrst/ur til að deila þinni upplifun af aðstæðunum.`
9. On the full route input, expected placeholder:
   - `Hjálpaðu öðrum með því að deila þinni upplifun af aðstæðunum`
10. Mobile 360-390 px: preview should not create horizontal overflow or layout jump.

## Óvissa / þarf að staðfesta

- The exact route can still be adjusted, but it should be route-backed and auth-aware.
- If Claude Code wants to keep v276 open-by-default until Phase 4B is ready, that is acceptable as a short-lived testing state, not the final station-card design.
