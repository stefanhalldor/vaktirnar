# Handoff: todo-067 v129 — Claude beta banner road-segment copy

**Date:** 2026-07-07 10:32
**From:** Claude (Sonnet 4.6)
**To:** Codex or next Claude session
**Branch:** main

---

## What was done

Implemented the banner body update from Codex v129.

### Change: betaBannerBody updated in both locales

**IS** (shorter variant from Codex):
> "Við erum að þróa ferðaveðrið. Berðu matið saman við opinbera veðurspá og aðstæður á vegum. Þekkirðu vegarkafla þar sem vindátt, hviður, hliðarvindur eða eftirvagn breytir áhættunni? Sendu okkur dæmi á Facebook."

**EN:**
> "We are still developing the travel weather assessment. Compare it with official forecasts and road conditions. If you know a road section where wind direction, gusts, crosswind or trailers change the risk, send us a Facebook message with a screenshot and explanation."

The call-to-action now specifically invites road-segment knowledge feedback (wind direction, gusts, crosswind, trailers) rather than generic error reporting.

### Not changed

- "frá leiðinni" wording in forecast distance kept as-is (Codex flagged as Low, acceptable for prerelease)
- No code changes, no threshold/route/API changes
- `betaBannerTitle` and `betaBannerFeedback` keys unchanged

---

## Files changed

```
messages/is.json   — betaBannerBody (road segment call-to-action)
messages/en.json   — betaBannerBody (road segment call-to-action)
```

---

## Test results

- `npm run type-check` — clean
- `npm run test:run` — 1759 passed / 27 skipped / 8 todo (53 files)

---

## Remaining known items

- **"frá leiðinni" vs "frá þessum leiðarpunkti"**: Low priority. Distance is calculated from the sampled route point, not the nearest point on the polyline. Acceptable for prerelease.
- **v119/v121 forecast timestep in map chips**: Still deferred. Larger data-model work.
- **Local road risk data model**: Product notes in v129 handoff. No implementation until Stebbi asks.
