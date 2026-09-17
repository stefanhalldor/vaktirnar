# v088 — SQL191 exact og localhost-gátt

Created: 2026-09-17 07:21
Timezone: Atlantic/Reykjavik

## Plan áfangans

Skrá exact postflight, loka SQL-gáttinni og opna afmarkað localhost-próf á
nákvæmri brotaskrift.

## Hvað var raunverulega gert

- Actual SQL191 postflight var `EXACT_INSTALLED`.
- `security_ok`, `projection_ok`, `command_ok`, `columns_ok` og `constraint_ok`
  voru öll true.
- SQL191 migration má ekki keyra aftur og engin frekari SQL bíður.

## Skrár sem voru skoðaðar

- Actual postflight-röð frá Stebba
- SQL191 artifacts og v085–v087 handoff

## Skrár sem voru breyttar

- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- `git diff --check`: PASS; aðeins line-ending warnings.
- Candidate validation: scoped lint, type-check, 29 focused próf og production
  build PASS.

## Hvað mistókst eða var sleppt

Browserprófun á exact fraction notation hefur ekki enn verið staðfest.

## Ákvarðanir

Postflight sannar private schema, constraint, service-only projection og
command write. Localhost má nú lesa og skrifa nýja samninginn.

## Áhætta sem er enn til staðar

Sjónræn framsetning á litlum skjám og refresh-hegðun þurfa handvirka
staðfestingu. Söguleg fraction-claims án metadata sýna fallback-stytt brot þar
til notandi vistar þau aftur; það er viljandi afturvirknihegðun.

## Tillaga að næsta skrefi

Stebbi prófar skrefin hér að neðan á localhost. Commit, push og production
bíða sérstaks samþykkis.

## Spurningar sem Codex á sérstaklega að rýna

- Heldur nýtt `2/10` nákvæmlega þeirri framsetningu eftir refresh?
- Sýna pilla, slider-label og brotareitir sama brot?
- Skiptir sliderinn aftur í Magn og hálft skref?

## Supabase

SQL191 er exact uppsett. Nullable fraction metadata, constraint, read
projection og claim command eru til og service-only security er óbreytt. Engin
RLS policy, auth regla eða client grant breyttist. Enga frekari SQL-skrá á að
keyra.

## Localhost checks for Stebbi

1. Endurhlaða innskráðu splitti á `http://localhost:3004`.
2. Opna „Nákvæmari mælieiningar“, velja Brot og vista `2/10`.
3. Staðfesta að pillan, merkið undir slider og brotareitir sýni `2/10`.
4. Endurhlaða síðuna og staðfesta aftur að `2/10` hafi ekki orðið `1/5`.
5. Staðfesta að canonical magn sé rétt, til dæmis 0,8 af 4 og 20%.
6. Hreyfa sliderinn; framsetningin á að skipta í Magn og hoppa á hálfum.
7. Prófa 360, 390 og 460 px án zoom, lárétts overflow eða overlap.

Ekki prófa production og ekki endurkeyra SQL190 eða SQL191.
