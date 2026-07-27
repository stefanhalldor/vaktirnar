# TODO #90 — Quick route-card polish

Created: 2026-07-27 08:06
Timezone: Atlantic/Reykjavik

## Samþykkt og niðurstaða

Stebbi samþykkti hraðan localhost-pússunarhring með fullum prófunum frestað þar
til fyrir útgáfu. Codex fjarlægði tæknilega Teskeiðar-label línu, reset-aði
horizontal card scroll við röðun og bætti við `Vegalengd` sorting.

## Breytingar

- Teskeið route cards birta ekki lengur concatenated diagnostic labels eins og
  `Tilraunaleið`, `Áætlaður aksturstími`, `Blandað slitlag` og `Tenging við
  vegagrunn óviss`.
- Raw labels haldast í route payload/domain fyrir diagnostics; aðeins card-texti
  var fjarlægður.
- Við smell á sorting færist horizontal route-card scroller á `left: 0` með
  smooth scroll, svo fremsta leið nýju raðarinnar sjáist.
- Nýr sorting-valkostur `Vegalengd` / `Distance` raðar lægsta `distanceKm` fyrst
  með stable original-order fallback.
- Sort control notar 2 dálka á þrengstu mobile breidd og 4 dálka frá 420 px til
  að forðast texta-overflow.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Quick checks

- `npm run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx`
  — exit 0, 12/12 tests passed.
- `npm run type-check` — exit 0.
- Message JSON parse — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

Full route/API/full-suite próf voru ekki keyrð samkvæmt ósk Stebba um hraðan
localhost-hring. Þau þarf að keyra áður en commit/push/deploy er samþykkt.

## Localhost checks for Stebbi

1. Opna stóra route comparison kortið.
2. Vænt: Teskeið-spjaldið sýnir ekki lengur tæknilegu label-línuna í rauða
   kassanum; km, tími, badges og slitlagsstika haldast.
3. Scrolla route cards til hægri og velja hvert sorting-filter fyrir sig.
4. Vænt: listinn færist alltaf lengst til vinstri og fremsta card nýju
   raðarinnar sést.
5. Velja `Vegalengd`.
6. Vænt: stysta km-leið er fremst, síðan næststysta; selected route og litir
   breytast ekki.
7. Prófa 360, 390, 420 og 460 px.
8. Vænt: fjögur sorting controls valda ekki horizontal overflow; undir 420 px
   birtast þau í 2x2 grid.
9. Prófa íslensku og ensku labels.

Engin Supabase-, auth-, RLS-, env-, migration- eða production-áhrif.

## Óvissa / útgáfuhlið

- Confidence: high fyrir afmarkaða UI/sort breytingu; targeted tests og types
  eru græn.
- Fyrir útgáfu þarf full test suite og browser regression yfir sjálfvirka
  fullscreen-opnun, route apply/no-refetch, Öxi-cautions og alternatives.
