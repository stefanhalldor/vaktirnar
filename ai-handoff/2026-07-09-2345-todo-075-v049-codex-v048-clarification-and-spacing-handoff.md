Created: 2026-07-09 23:45
Timezone: Atlantic/Reykjavik

# TODO 075 v049 - Codex Clarification After v048

Reviewed / referenced:

- `ai-handoff/2026-07-09-2337-todo-075-v047-codex-v046-scrubber-whole-hours-review.md`
- `ai-handoff/2026-07-09-2345-todo-075-v048-claude-v047-review-analysis.md`

## Updated Status From Stebbi

Stebbi reran localhost after v048 and got:

```text
Núna 23:42
```

That confirms the important P1 concern from Codex v047 is not reproducing in the current normal flow. The earlier screenshot with `Núna 23:00` was most likely stale state or an older result, not the current server-side candidate generation.

## Clarification: P1

P1 is no longer a blocker.

The intended and now-confirmed behavior is:

- first slot is actual run time,
- route ETA and route-point weather evaluation use that exact `departureIso`,
- following slots are whole-hour choices.

No further P1 code change is required unless Stebbi reproduces `Núna` showing a rounded hour again in a fresh run.

## Clarification: P2

P2 was not meant as a current blocker.

The issue Codex was flagging was only future-proofing:

- Current code labels first single-departure slot as `Núna`.
- That is correct today because the single-departure flow means "leave now".
- If a future UI lets the user explicitly choose "legg af stað kl. 14:00", then first slot should probably not say `Núna`.

For this release:

- Do not solve P2.
- Do not add `departureMode` now.
- Do not expand the travel result type just for this.
- Treat P2 as a future reminder for explicit future departure UI.

## Remaining Requested Work

Only the visual spacing remains from Stebbi's feedback:

> Svo finnst mér við alveg geta þjappað hinum punktunum aðeins í scrubbernum.

Current implementation already uses compact labels:

- `00`
- `1`
- `2`
- `17`

But the visible spacing still feels airy because `DepartureHeatmap` uses:

```tsx
<div className="flex gap-1.5 items-end">
...
className="... min-w-[42px] px-1.5 py-1.5 ..."
```

## Suggested Implementation For Claude Code

Make a small UI-only patch in `components/weather/DepartureHeatmap.tsx`.

Recommended direction:

1. Reduce gap between hour slots:

   ```tsx
   gap-1.5 -> gap-1
   ```

   If still too airy in localhost, try `gap-0.5`, but keep it tappable.

2. Reduce regular non-first slot width slightly.

   Current:

   ```tsx
   min-w-[42px] px-1.5
   ```

   Suggested:

   - regular whole-hour slots: `min-w-9` or `min-w-[36px]`
   - first `Núna` slot: keep `min-w-[42px]` or slightly larger if needed because it has two text lines

3. Avoid layout shift when a slot becomes selected:

   The selected class uses `border-2`; if reducing widths makes the selected state jump, compensate with stable sizing or keep enough padding.

4. Do not make the tappable target too small.

   `Design.md` says touch targets should generally be around 40x40 px. It is okay for a dense horizontal scrubber to feel compact, but not fiddly.

5. Do not change:

   - timeline generation,
   - weather scoring,
   - route provider,
   - forecast drawer,
   - thresholds,
   - SQL / Supabase / auth / analytics.

## Acceptance Criteria

1. Fresh localhost run at a non-whole time, e.g. `23:42`, still shows:

   ```text
   Núna
   23:42
   ```

2. Following slots remain:

   ```text
   00 1 2 3 4 ...
   ```

3. Slots appear visibly tighter than v046 screenshot.
4. Whole-hour slots still have full `hh:mm` in aria labels.
5. Selecting `1` still updates the detail section to full time, e.g. `kl. 01:00`.
6. Mobile 360-390 px has no horizontal page overflow.
7. Scrubber remains easy enough to tap.

## Localhost Checks For Stebbi

After Claude Code's spacing patch:

1. Open `/auth-mvp/vedrid` on localhost.
2. Run a normal route at a non-whole current time.
3. Expected: first slot says `Núna` and the exact current minute, e.g. `23:42`.
4. Expected: later slots use compact labels (`00`, `1`, `2`, `17`) and look tighter than before.
5. Tap a compact slot, e.g. `1`.
6. Expected: the `Brottför` row below shows full date and time, e.g. `kl. 01:00`.
7. Expected: map, `Á leiðinni`, destination weather, and route point details update as before.
8. Test on narrow mobile width around 360-390 px.
9. Expected: no horizontal page overflow, no label overlap, and slots are still tappable.

No SQL, Supabase, RLS, auth, secrets, billing, deployment, migration, or production data should be touched.

## Codex Recommendation

Proceed only with the small spacing patch. v046's data/timeline behavior is acceptable after Stebbi's fresh localhost confirmation.
