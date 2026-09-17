# v079 — Magn undir slider-punkti og hálf skref

Created: 2026-09-16 23:31
Timezone: Atlantic/Reykjavik

## Plan áfangans

Sýna eigið magn undir slider-punktinum og láta hreyfingu sliders smella á hálfum
stykkjum án þess að færa fyrirliggjandi nákvæmt claim ranglega.

## Hvað var raunverulega gert

- Magnmerki fylgir staðsetningu slider-punktsins.
- Vistað 0,4 birtist í 10% stöðu á 0–4 kvarða.
- Sliderhreyfing námundast í 0,5 stk. skref.
- Mutation er áfram aðeins send þegar notandi sleppir eða lýkur lyklaborðsaðgerð.

## Skrár sem voru skoðaðar

- `components/receipt-split/SplitBoardV2.tsx`
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

Native range notar nákvæma persisted stöðu en client state námundar nýja hreyfingu
í hálft stykki. Þannig helst eldri 0,4 claim sýnilegt án þess að slider stofni ný
tilviljanakennd brotagildi.

## Áhætta sem er enn til staðar

Merkið undir punktinum þarf sjónræna prófun við báða enda stikunnar og á iOS.

## Tillaga að næsta skrefi

Endurhlaða localhost og prófa 0, 0,4, 0,5, miðju og hámark. Commit, push og
production bíða sérstaks samþykkis.

## Spurningar sem Codex á sérstaklega að rýna

Engar opnar tæknilegar spurningar.

## Supabase

Engin SQL-skrá var búin til eða keyrð. Gögn, RLS, auth, policies, functions og
production eru óbreytt.

## Localhost checks for Stebbi

1. Endurhlaða lið með heildarmagn 4 og vistað eigið magn 0,4.
2. Staðfesta að punkturinn og `0,4` séu um 10% frá núllenda stikunnar.
3. Draga stikuna og staðfesta röðina 0, 0,5, 1, 1,5 og áfram.
4. Staðfesta að talan sitji undir punktinum líka við 0 og hámark án overflow.
5. Prófa 360, 390 og 460 px og staðfesta að vistun fari fyrst af stað við release.

Ekki þarf að keyra SQL eða prófa production.
