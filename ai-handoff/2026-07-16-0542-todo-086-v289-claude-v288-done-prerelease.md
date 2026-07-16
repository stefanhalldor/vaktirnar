# 2026-07-16 05:42 - TODO-086 v289 - Claude: v288 findings done + UX polish

Created: 2026-07-16 05:42
Timezone: Atlantic/Reykjavik

Fixes v288 Codex review (High + both Mediums) and two localhost notes from Stebbi.

## Breytingar

### `app/api/auth-mvp/vedurpuls/access/route.ts` — NÝ

Lightweight GET endpoint sem kannar hvort innskráður notandi geti skrifað í Veðurpúls:

- **200** `{ canPost: true }` — aðgangur leyfður
- **401** — middleware skilar þessu ef notandi er ekki innskráður
- **403/503** — `chatAccessError(access)` ef innskráður en ekki með aðgang

Nota sama mynstur og `thread/route.ts` (`createClient` + `checkChatAccess` + `chatAccessError`).

### `components/weather/VedurstofanPulseInline.tsx` — endurskrifað

**High (v288) — Mobile input:**
- Input: `text-base min-h-10` (var `text-xs min-h-8`)
- Send takki: `text-sm min-h-10` (var `text-xs min-h-8`)
- Passar Design.md kröfur: ≥16 px texti á input, ≥40px touch target

**Medium (v288) — Access check á mount:**
- Sækir `/api/auth-mvp/vedurpuls/access` og `/api/teskeid/weather/vedurpuls/stations/[stationId]/preview` samhliða í useEffect
- `PostingAccess` state: `'unknown' | 'allowed' | 'needs-login' | 'denied'`
- Composer sýndur aðeins þegar `postingAccess === 'allowed'`
- Login link sýndur strax þegar `postingAccess === 'needs-login'` — ekki eftir failed send
- `'denied'` (403/503): preview sýnd, ekkert compositor, engin login link

**Medium (v288) — 403/503 á send:**
- Kemur ekki lengur í `accessDenied` → `return null`
- Setur `setPostingAccess('denied')` → felur aðeins composer, preview lifir

**Localhost frá Stebbi — "Opna púls" link:**
- Alltaf sýnilegur neðst, texti `t('pulseViewMore')` = "Sjá fleiri skilaboð"
- Href: `/auth-mvp/vedrid/puls/stod/${stationId}` (engin returnTo — elta-vedrid fallback í VedurstofanPulsClient)
- `pulseOpenFull` ("Opna púlsinn") er óbreytt í elta-vedrid (`WeatherPulseSummary`)

**Localhost frá Stebbi — Header:**
- `<p className="text-[11px] font-medium text-muted-foreground">{t('pulseInlineHeader')}</p>`
- "Nýjast af staðnum frá notendum Teskeið.is"

### `messages/is.json` + `messages/en.json`

Nýir lyklar í `teskeid.vedrid.eltaVedrid`:

| Lykill | IS | EN |
|--------|----|----|
| `pulseInlineHeader` | Nýjast af staðnum frá notendum Teskeið.is | Latest from locals on Teskeið.is |
| `pulseViewMore` | Sjá fleiri skilaboð | See more messages |

(`pulseNeedsLogin` var bætt við í v287.)

## Skrár breyttar

- `app/api/auth-mvp/vedurpuls/access/route.ts` — NÝ
- `components/weather/VedurstofanPulseInline.tsx` — endurskrifað
- `messages/is.json` — 2 nýir lyklar
- `messages/en.json` — 2 nýir lyklar

## Type-check

```
npm run type-check: exit 0, no errors
```

## Localhost checks fyrir Stebbi

### Óinnskráður notandi

1. Skrá sig út
2. Fara á `/vedrid`, búa til ferð með Veðurstofustöð
3. Smella á versta punkt
4. **Búist við:**
   - Header: "Nýjast af staðnum frá notendum Teskeið.is"
   - Preview sést (eða empty state ef engin skilaboð)
   - Engin input — í stað þess birtist: "Skráðu þig inn til að skrifa í Veðurpúls" link
   - "Sjá fleiri skilaboð" link sést alltaf

### Innskráður notandi

5. Skrá sig inn
6. Sama ferð og hér að ofan
7. **Búist við:**
   - Header sést
   - Preview sést
   - Composer (input + Senda takki) sést — `text-base`, `min-h-10`, enginn mobile zoom
   - "Sjá fleiri skilaboð" link sést neðst
8. Slá inn texta og senda
9. **Búist við:** Preview uppfærist, input hreinsar sig
10. Smella á "Sjá fleiri skilaboð"
11. **Búist við:** Fer á `/auth-mvp/vedrid/puls/stod/[stationId]` — "Til baka" fer á `/auth-mvp/vedrid/elta-vedrid?stationId=...`

### Regression

12. Fara á `/auth-mvp/vedrid/elta-vedrid`, velja stöð
13. **Búist við:** `WeatherPulseSummary` óbreytt — "Opna púlsinn" texti lifir þar

## Pending

- Stebbi gerir localhost checks
- Stebbi gefur commit-leyfi
- **v286 findingar (óframkvæmdar):**
  - Medium: `returnTo` stale URL fix í elta-vedrid
  - Low: unit tests fyrir `resolveBackHref`
- Low (v288): extract reusable ChatPreviewWithComposer core (deferred)
- Deferred (Phase 4B.2): station/weather context á full pulse route
