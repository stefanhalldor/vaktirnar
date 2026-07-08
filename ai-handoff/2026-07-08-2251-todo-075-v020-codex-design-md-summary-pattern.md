# Codex handoff: TODO #75 v020 - Design.md summary pattern + weather card polish

Created: 2026-07-08 22:51  
Timezone: Atlantic/Reykjavik  
Reviewed handoff: `ai-handoff/2026-07-08-2248-todo-075-v019-claude-v017-done.md`

## Summary

Claude v019 fixed the technical issues from v017/v018:

- old selected-slot detail box is gone from the top result card
- status dot duplication is gone
- route ETA is used for the worst point
- dative origin wording is used
- first-point wording exists
- Icelandic weekday is lowercase

But Stebbi is right: the current three-part summary still does not look professional. It is visually just three loose text groups under the scrubber. The issue is not only local Tailwind polish; `Design.md` lacks a pattern for structured summary panels / itinerary rows inside an existing card.

## Design.md Gap

Current `Design.md` gives good generic rules:

- no card-in-card
- clear typography hierarchy
- mobile-first
- borders carry structure
- metadata is `text-xs`, muted

But it does not say how to render a compact, structured summary with 2-4 related steps, like:

- departure
- en-route condition
- arrival/destination forecast

Without a pattern, implementations drift into either loose paragraphs or nested cards. v019 landed in loose paragraphs.

## Proposed Design.md Addition

Add this under `## Yfirborð og form`, after `### Cards` or after `### Borders og shadows`.

```md
### Structured summary panels

Use structured summary panels when one card needs to summarize a selected
state made of 2-4 related facts or steps, for example trip times, route status,
payment state, booking-like confirmations, or weather-at-arrival summaries.

These panels are not nested cards. Inside an existing card, prefer:

- `border-y` or `divide-y` separators instead of another rounded card
- a two-column row layout on mobile when labels are short:
  label column around 72-88 px, content column flexible
- short semantic labels such as `Brottför`, `Á leiðinni`, `Koma`
- one primary line per row in `text-sm font-medium`
- supporting details in `text-xs text-muted-foreground`
- a compact status badge or colored text only where it adds meaning
- no duplicate status dot if the nearby control already carries that state
- stable row spacing: 10-12 px vertical padding, 8 px internal gap

Avoid:

- loose stacks of paragraphs with weak section labels
- uppercase metadata labels as the only hierarchy
- repeating the same selected state immediately below the control that selected it
- nested rounded cards unless the inner element is an actual independent tool
- more than one strong visual accent in the same compact summary
```

This is intentionally generic enough for future Teskeiðar, not just weather.

## Recommended UI Pattern For This Weather Card

Keep the existing outer result card. Do not add a new rounded inner card.

After the scrubber, render a structured summary using `border-y divide-y`, something like:

```tsx
<div className="border-y border-border/70 divide-y divide-border/60">
  <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
    <p className="text-[11px] font-semibold text-muted-foreground">Brottför</p>
    <p className="text-sm font-medium text-foreground">mið. 8. júl kl. 22:34</p>
  </section>

  <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
    <p className="text-[11px] font-semibold text-muted-foreground">Á leiðinni</p>
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">Gott ferðaveður m.v. valin mörk</p>
      <p className="text-xs text-muted-foreground">Mest krefjandi: 42 km frá Garðabæ, kl. 23:16</p>
      <p className="text-xs text-muted-foreground">Vindur 9,1 m/s · Úrkoma 0,2 mm/klst · Hiti 9,4°C</p>
    </div>
  </section>

  <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
    <p className="text-[11px] font-semibold text-muted-foreground">Koma</p>
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">mið. 8. júl kl. 23:30</p>
      <p className="text-xs text-muted-foreground">Spáin þar kl. 00:00: vindur 7,9 m/s · úrkoma 0 mm/klst · hiti 9,7°C</p>
      <button className="text-[11px] font-medium text-primary underline">Skoða spána á áfangastað betur</button>
    </div>
  </section>
</div>
```

Notes:

- `Koma` is likely cleaner than `Áfangastaður` because it pairs with `Brottför` and feels more booking-like.
- Use lower-case metric labels inside sentence-like lines: `vindur`, `úrkoma`, `hiti`.
- If the line gets too long on 360 px, split metrics into two lines rather than shrinking text below readable size.
- The condition line can be the primary line of `Á leiðinni`; no dot needed.
- The threshold line above the scrubber can remain as low-emphasis metadata, but avoid letting it compete with the summary.

## Required Claude Code Work

1. Add the `Structured summary panels` section to `Design.md` as above or with very close wording.
2. Update the top weather result summary in `FerdalagidClient.tsx` to follow that pattern.
3. Prefer `Koma` over `Áfangastaður` if Stebbi agrees; otherwise keep `Áfangastaður` but use the same structured row pattern.
4. Keep all user-facing copy in `messages/is.json` and `messages/en.json`.
5. Do not touch SQL, Supabase, RLS, auth, usage tracking, billing, secrets, deployment, Phase 2 forecast-table work, night filters, gust trend arrows, or frost-aware temp.

## Specific Review Notes On v019

No blocking technical findings in v019 from a data/auth perspective. This is a product/UI quality issue.

Remaining issues:

- The three sections have no strong shared container or row rhythm.
- Labels sit above text, so the summary reads like a form/debug output instead of an itinerary.
- `Áfangastaður` is less parallel than `Brottför`; `Koma` is probably better for this card.
- The status sentence is technically in the right section now, but visually still reads as another paragraph.
- Metrics still look copied from details rather than composed for a summary.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` on localhost.
2. Run a route with several departure options, e.g. Garðabær -> Akranes.
3. Select a time in the scrubber.
4. Expected: the summary below the scrubber looks like a compact itinerary/weather summary, not three loose paragraphs.
5. Expected: `Brottför`, `Á leiðinni`, and `Koma`/`Áfangastaður` are easy to scan at 360 px width.
6. Expected: no old selected-slot detail box appears under the scrubber.
7. Expected: no redundant green dot appears in the summary.
8. Expected: worst-point time remains route ETA, not forecast bucket.
9. Expected: `frá Garðabæ`/`frá Akranesi` still reads naturally.
10. Expected: destination forecast drawer still opens from `Skoða spána á áfangastað betur`.
11. Regression check: return scrubber still shows its selected detail card if that behavior is still intended.
12. Regression check: sticky day markers in the scrubber still work.

## Tests

Codex did not run tests for this review. Claude v019 reports:

- Type-check: PASS
- Tests: 1958 pass, 27 skipped, 8 todo

