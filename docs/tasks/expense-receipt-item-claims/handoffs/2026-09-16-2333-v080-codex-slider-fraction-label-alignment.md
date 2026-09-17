# v080 — Brot miðjað undir slider-punkti

Created: 2026-09-16 23:33
Timezone: Atlantic/Reykjavik

## Plan áfangans

Miðja gildið undir slider-punktinum og sýna nákvæmt valið hlutfallsbrot þegar
það er örugglega hægt að endurreikna það úr vistaða claiminu.

## Hvað var raunverulega gert

- Merkið tekur mið af innri ferðamörkum native slider-thumb og miðjast undir því.
- Claim 0,4 af 4 birtist sem `1/10` undir punktinum.
- Ef lítið nákvæmt brot fæst ekki er venjulegt magn áfram birt.
- Participant-pillan sýnir áfram magn, svo fjárhagsleg magnmerking glatast ekki.

## Skrár sem voru skoðaðar

- `components/receipt-split/SplitBoardV2.tsx`
- `lib/receipt-split/quantity-v2.ts`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`

## Skrár sem voru breyttar

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- canonical task-skjal og þetta handoff

## Skipanir og niðurstöður

- Focused Vitest: 18/18 PASS, exit 0.
- Type-check: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.

## Hvað mistókst eða var sleppt

Engin browserprófun var keyrð af Codex og dev server var ekki snertur.

## Ákvarðanir

Gagnalíkanið geymir niðurstöðumagn en ekki valda innsláttarleið. UI endurreiknar
því aðeins lítið nákvæmt brot; það fullyrðir ekki að brot hafi verið valið þegar
slíkt brot fæst ekki.

## Áhætta sem er enn til staðar

Native thumb-breidd getur verið lítillega mismunandi milli vafra og þarf því
sjónræna iOS/Android-rýni.

## Tillaga að næsta skrefi

Endurhlaða localhost og staðfesta miðjun við 1/10, 1/2, 0 og hámark.

## Spurningar sem Codex á sérstaklega að rýna

Engar opnar tæknilegar spurningar.

## Supabase

Engin SQL-skrá var búin til eða keyrð. Gögn, RLS, auth, policies, functions og
production eru óbreytt.

## Localhost checks for Stebbi

1. Endurhlaða Acqua Gas liðinn með 0,4 af 4.
2. Staðfesta að `1/10` birtist undir og miðjað við punktinn.
3. Prófa 0, 0,5, 1/2 og hámark við 360, 390 og 460 px.
4. Staðfesta að merkið fari ekki út úr kortinu við enda stikunnar.
5. Staðfesta að slider sendi enn aðeins eina vistun þegar sleppt er.

Ekki þarf að keyra SQL eða prófa production.
