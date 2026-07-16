# Handoff: TODO #085 v015 — Released

**Date:** 2026-07-11
**Session:** Claude
**Commit:** 24d38f4
**Status:** Pushed to main, Vercel deploying

---

## Root cause fixed

Tailwind `content` config scans `app/`, `components/`, `pages/`, `src/` — but NOT `lib/`. All Tailwind class strings that lived in `lib/weather/windDisplayStatus.ts` (dotClass, borderClass, chipActiveClass, labelClass) were being purged in production builds.

---

## What changed

### New file: `components/weather/windStatusUi.ts`

Contains `WIND_STATUS_UI_META` — all Tailwind class strings for each `WindDisplayStatus`. Located in `components/` so Tailwind scans and keeps all classes.

### `lib/weather/windDisplayStatus.ts`

- `WIND_STATUS_META`: stripped down to `{ labelKey, icon }` only (no Tailwind classes)
- `WIND_STATUS_MARKER_COLOR['othaegilegt']`: `#f59e0b` → `#f97316` (orange-500, distinct from amber)

### `components/weather/DepartureHeatmap.tsx`

- Imports `WIND_STATUS_UI_META` from `windStatusUi` (aliased as `WIND_STATUS_META`)
- Scrubber slot dots (16px circle) now render icons inside:
  - `innan-marka`: `Check` (Lucide) in white
  - `haettulegt`: `TriangleAlert` (Lucide) in white
  - Other statuses: plain colored circle as before

### `components/weather/TravelAuditMap.tsx`

- Imports `WIND_STATUS_UI_META` from `windStatusUi`
- Non-endpoint route point markers now get a text label in the update effect:
  - `innan-marka`: `✓` (white, 9px)
  - `haettulegt`: `!` (white, 11px)
  - Others: label cleared
  - Origin/destination endpoint labels (`Frá`/`Til`) are NOT touched

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

- Imports `WIND_STATUS_UI_META` from `@/components/weather/windStatusUi`

---

## Post-release checks

1. Vercel build passes (monitor logs)
2. On `/vedrid` with a route that produces multiple statuses:
   - `Óþægilegt` pill: clearly orange dot and orange active background (not amber/yellow)
   - `Óþægilegt` scrubber dots: orange circle
   - `Nálgast óþægindi` scrubber dots: amber/yellow — visibly distinct from orange
   - `Innan marka` scrubber dots: green circle with white checkmark ✓
   - `Hættulegt` scrubber dots (if reachable): red circle with warning triangle
   - Filter pill active state: colored background matches status
   - Map markers: `Óþægilegt` markers are orange (#f97316), distinct from amber (#f59e0b)
   - `Innan marka` non-endpoint markers show `✓` text label
   - `Hættulegt` non-endpoint markers show `!` text label
   - Origin (`Frá`) and destination (`Til`) labels unaffected

---

## What is NOT changed

- Pill order (safe to dangerous) — unchanged from v013
- Threshold form UX — unchanged
- Gust removal — unchanged
- Map pill chipActiveClass colors — unchanged (now actually applied via windStatusUi)
- `ROUTE_POINT_CARD_CLASS` in FerdalagidClient — already in `app/` (scanned), no change needed
