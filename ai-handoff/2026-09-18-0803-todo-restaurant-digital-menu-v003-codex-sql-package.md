# restaurant-digital-menu-to-split — SQL package v003

Created: 2026-09-18 08:03  
Timezone: Atlantic/Reykjavik

## Eigendagátt

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA.**

Allur SQL192 pakkinn fylgir hér saman: preflight, migration og postflight.
Keyrðu hverja skrá í sinni nýju query í nákvæmri röðinni hér fyrir neðan.
Stoppaðu strax ef preflight er ekki exact `READY`, migration skilar nokkurri
villu eða óljósri transaction-stöðu, eða postflight er ekki exact `PASS`.

Rétt staðfesta targetið er Supabase project `bpjwgutpzsifjaucvkbk`:
[Opna SQL Editor fyrir exact project](https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new).

## Keyrsluröð og fryst bytes

1. [SQL192 preflight](/C:/Users/Lenovo/Documents/vaktirnar/.tmp/restaurant-menu-split-v1/sql/validation/192-restaurant-menu-split-v1/preflight.sql)
   - Hlutverk: read-only `PREFLIGHT`.
   - SHA-256: `9EE001873FC4C1B549BB244BE046EF5D414E9D0ED19998DE72CCB555FEEB648C`
   - Stærð: `1429` bytes.
   - Expected: nákvæmlega ein result row með `gate = READY` og öllum boolean dálkum `true`.

2. [SQL192 migration](/C:/Users/Lenovo/Documents/vaktirnar/.tmp/restaurant-menu-split-v1/sql/192_restaurant_menu_split_v1.sql)
   - Hlutverk: forward-only `MIGRATION`; breytir schema, functions, grants og RLS-varinni restaurant geymslu í einni transaction.
   - SHA-256: `4FCE233B2A097DC5848470E44814BE1E9B47CEC60B5CFCFD9B13C1C5A7A3F736`
   - Stærð: `60915` bytes.
   - Expected: successful completion án error. Ef editor skilar villu eða óljósri stöðu skal ekki endurkeyra og ekki keyra postflight.

3. [SQL192 postflight](/C:/Users/Lenovo/Documents/vaktirnar/.tmp/restaurant-menu-split-v1/sql/validation/192-restaurant-menu-split-v1/postflight.sql)
   - Hlutverk: read-only `POSTFLIGHT`.
   - SHA-256: `61C9AA10EFA4EFA2E9EF27379DD3E1529E68BB820CB4633A47FCF1EB370A2A4D`
   - Stærð: `2304` bytes.
   - Expected: nákvæmlega ein result row með `gate = PASS` og öllum boolean dálkum `true`.

Sendu alla result row úr preflight, öll migration skilaboð eða villu og alla
result row úr postflight. Ekki keyra neitt aftur blint ef niðurstaða er önnur.

## Workflow leiðrétting

Repository `WORKFLOW.md` vísar nú á canonical `Documents/WORKFLOW.md` og bætir
við verkefnissértækri reglu um að afhenda preflight, migration og postflight
saman. Reglan krefst einnig beins, staðfests SQL Editor-hlekks á exact Supabase
project, SHA-256, byte-stærðar, expected result og stop-skilyrða. Keyrsluröðin
og no-blind-retry mörkin haldast óbreytt. `BASELINE_RED_NONBLOCKING` reglan var
varðveitt í styttri repository-specific útgáfunni.

## Staða candidate

- Isolated branch: `codex/restaurant-digital-menu-to-split-v1`
- Fyrri implementation commit: `85b381006e9d8ccceace7691852b8ea60236d918`
- Baseline og staðfest `origin/main`: `cd7e80bff08de31ccdc47ecc62ad425d19558c92`
- SQL artifacts sjálf eru óbreytt frá v002; aðeins workflow og þessi nýja handoff-afhending breytast.
- Codex hefur ekki keyrt SQL og hefur ekki gert Supabase-, Production-, push-, merge- eða deploy-aðgerð.

## Localhost checks for Stebbi

Eftir exact `PASS` postflight og áður en release kemur til greina skal Stebbi
prófa public matseðil og restaurant/Splitt-flæðið samkvæmt v002 handoffi við
360, 390 og 460 px. Ekki nota Production notendagögn í handahófskennd próf;
nota skal afmarkaða flaggaða prófunarnotendur og staðfesta sérstaklega deny
tilvik fyrir owner, staff, guest og Split membership.
