# 2026-07-15-0015 | todo-086 | v195 | claude | v194 done — prerelease

## Status
All v194 UI polish implemented. TypeScript clean.

---

## What changed

### 1. Elta veðrið map zoom
`VedurstofanStationExplorerClient.tsx`: `zoom: 6` → `zoom: 5`

### 2. Footer attribution removed
Three footer render sites removed:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `{t('attribution')}` line removed
- `app/auth-mvp/vedrid/VedridClient.tsx` — `{t('attribution')}` line removed
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` — attribution + serviceUrl paragraph removed

met.no attribution is still visible as `met.no` + `Yr spágögnin` in the provider filter tile, satisfying CC BY 4.0. Message keys (`teskeid.vedrid.attribution`, `teskeid.vedrid.eltaVedrid.attribution`) are now unused but left in place.

### 3. Provider filter — compact three-tile layout
`app/auth-mvp/vedrid/FerdalagidClient.tsx`: replaced the three-group vertical stack with a `grid grid-cols-3 gap-2` layout.

Each tile:
- Status label (9px uppercase): `Sannreynt` / `Í prófunum` / `Væntanlegt`
- Provider name (11px medium): `met.no` / `Veðurstofan` / `Vegagerðin`
- met.no tile: helper text `Yr spágögnin` beneath name
- Toggle switch (h-4 w-7, smaller than before) at bottom via `mt-auto`
- Active tile: `border-primary/40 bg-primary/5`
- `role="switch"` + `aria-checked` + `focus-visible:ring-2` preserved
- min-h-[72px] for touch comfort

Vegagerðin tile:
- Non-interactive `div`, `aria-disabled="true"`, `opacity-40`
- Provider name is an `<a href="https://umferdin.is/" target="_blank" rel="noopener noreferrer" tabIndex={-1}>` — mouse-accessible, keyboard-skipped
- No toggle interaction

### 4. weatherDisclaimer copy updated
Both locales updated to remove the "Þetta er mat..." / "This assessment..." lead-in sentence.

IS: `"Fyrir akstur skaltu líka athuga hviður og vegaaðstæður, t.d. hjá <link>Vegagerðinni</link>, sérstaklega ef þú ert með kerru, fellihýsi eða hjólhýsi."`

EN: `"Before driving, also check gusts and road conditions, e.g. with the <link>Icelandic Road Administration</link>, especially if you are towing a trailer, folding camper, or caravan."`

### 5. providerMetnoHelperText updated
IS: `"Yr spágögnin"` (was `"Staðfest grunnlína"`)
EN: `"Yr forecast data"` (was `"Verified baseline"`)

### 6. sql/77 comment typo fixed
`sql/74_vedurstofan_stations.sql` → `sql/74_vedurstofan_product_tables.sql`

---

## Localhost checks for Stebbi

1. `/auth-mvp/vedrid/elta-vedrid` — map should open one zoom level further out, all Iceland visible
2. `/auth-mvp/vedrid` — no attribution footer on entry screen
3. Run a weather query — no attribution footer on result screen
4. Enable Veðurstofan flag — provider filter should show three compact tiles in one row
5. Toggle met.no and Veðurstofan — tiles update visually (border/bg), behavior unchanged
6. Vegagerðin tile: hover shows underline on name; clicking name opens umferdin.is in new tab; tile itself is not clickable
7. Trigger amber caution box — disclaimer is now the shorter Vegagerðin/hviður sentence only
8. Check 360px width — no horizontal overflow in the three-tile grid
