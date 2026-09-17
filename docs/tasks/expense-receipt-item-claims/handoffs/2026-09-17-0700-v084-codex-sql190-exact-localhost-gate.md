# v084 — SQL190 exact og localhost-gátt

Created: 2026-09-17 07:00
Timezone: Atlantic/Reykjavik

## Plan áfangans

Skrá exact postflight og opna localhost-prófun á persisted input mode.

## Hvað var raunverulega gert

- Actual postflight var `EXACT_INSTALLED`.
- `security_ok`, `projection_ok`, `command_ok`, `column_ok` og `constraint_ok`
  voru öll true.
- SQL190-gáttinni er lokað; migration má ekki keyra aftur.

## Skrár sem voru skoðaðar

- Actual postflight-röð frá Stebba
- SQL190 artifacts og v081–v083 handoff

## Skrár sem voru breyttar

- canonical task-skjal
- þetta immutable handoff

## Skipanir og niðurstöður

- `git diff --check`: PASS.
- Fyrri candidate validation: 28/28 focused próf, type-check, scoped lint og
  production build PASS.

## Hvað mistókst eða var sleppt

Engin browserprófun hefur enn verið staðfest eftir SQL190 uppsetningu.

## Ákvarðanir

Exact postflight sannar private schema, constraint, projection, command write og
service-only security. Næsta gátt er því eingöngu notendaprófun á localhost.

## Áhætta sem er enn til staðar

Native slider presentation og þétting kortsins þurfa sjónræna mobile-rýni.

## Tillaga að næsta skrefi

Stebbi endurhleður localhost og prófar skrefin hér að neðan. Commit, push og
production bíða sérstaks samþykkis.

## Spurningar sem Codex á sérstaklega að rýna

- Heldur Brot/Prósenta framsetningu eftir refresh?
- Skiptir fyrsta sliderhreyfing yfir í Magn og hálft skref?
- Er „Ég tek restina“ rétt staðsett án mobile overflow?

## Supabase

SQL190 er exact uppsett. Dálkur og constraint eru til, read projection og claim
command bera input mode og functions eru áfram service-only. Engin RLS policy,
auth regla eða client grant breyttist.

## Localhost checks for Stebbi

1. Endurhlaða núverandi `http://localhost:3004` eftir hot reload.
2. Velja Brot, setja `1/10`, vista og endurhlaða síðuna. Pillan og merkið undir
   slidernum eiga að sýna `1/10`.
3. Hreyfa sliderinn. Hann á að hoppa í hálfum, sýna Magn og vista `inputMode=quantity`.
4. Endurhlaða aftur. Magnframsetningin á að haldast; hún má ekki verða `3/8`.
5. Vista Prósentu og endurhlaða; prósentan á að haldast.
6. Staðfesta að „Ég tek restina“ sé við `x af y eftir` og að skúffan heiti
   „Nákvæmari mælieiningar“.
7. Prófa 360, 390 og 460 px, sérstaklega label undir thumb og læstan enda.
8. Staðfesta að engin mutation fari af stað meðan fingur er á slider og aðeins
   ein þegar sleppt er.

Enga frekari SQL-skrá á að keyra.
