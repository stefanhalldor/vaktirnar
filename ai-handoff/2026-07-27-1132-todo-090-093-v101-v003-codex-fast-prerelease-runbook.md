# TODO-090 v101 + TODO-093 v003 — hraðrunbook fyrir prerelease

**Created:** 2026-07-27 11:32  
**Timezone:** Atlantic/Reykjavik  
**Agent:** Codex  
**Staða:** Skref 1 staðfest read-only; næstu skref bíða afmarkaðra leyfa Stebba.

## Niðurstaða

Kóðarýni, full prófun og production build eru græn samkvæmt v100/v002 og
Claude prerelease-rýninni. Fljótasta örugga leiðin er að ljúka HMS-attribution,
gefa fyrst út með HMS óvirkt, keyra síðan production migration og controlled
import, prófa HMS frá localhost og virkja HMS að lokum í production.

## Skref 1 — HMS endurnotkun staðfest

Opinber lýsigagnaskrá Staðfangaskrár:

- heimilar afritun, birtingu, dreifingu, aðlögun og notkun, líka í hagnaðarskyni;
- segir að engar takmarkanir séu á opinberum aðgangi;
- krefst þess að uppruni sé tekinn fram;
- leggur til orðalagið „Byggir á upplýsingum frá“ ásamt nafni rétthafa;
- segir að notkun megi ekki gefa í skyn opinbert samþykki HMS;
- undanskilur HMS ábyrgð á villum, vanskráningu og áframhaldandi aðgengi.

Canonical attribution fyrir Teskeið:

`Byggir á upplýsingum úr Staðfangaskrá HMS.`

Opinberar heimildir:

- https://hms.is/gogn-og-maelabord/grunngogntilnidurhals/stadfangaskra
- https://gatt.natt.is/geonetwork/srv/api/records/%7BA879D973-CA98-49D7-AA50-7BC35047E461%7D

## Hraðasta örugga röðin

1. Bæta HMS við canonical data-license skrá/constant og sýna stutta tengda
   attribution þar sem HMS-staðaleit er notuð. Ekki dreifa textanum um JSX.
2. Keyra aðeins afmörkuð HMS/staðaleitarpróf, type-check og lint fyrir þessa
   litlu viðbót; full suite/build er þegar græn frá v100/v002.
3. Stebbi staðfestir localhost bootstrap-state með HMS óvirkt.
4. Með sérstöku leyfi: commit-a allar samþykktar TODO-090/093 breytingar.
5. Með sérstöku leyfi: push-a á `main` og fylgjast með Vercel þar til build er
   grænt.
6. Fyrsti production deploy heldur continuity-state:
   - `HMS_PLACE_SEARCH_ENABLED=false`
   - `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=false`
   - `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true`
7. Smoke test á production fyrir núverandi leit og reverse labels.
8. Með sérstöku Supabase-leyfi: keyra `sql/94_hms_place_directory.sql` í
   production. SQL býr til HMS-töflur/RPC, virkjar RLS og veitir aðeins
   `service_role` aðgang; hún flytur ekki gögn sjálf.
9. Controlled import frá localhost sem vísar á production Supabase:
   - local `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=true`
   - local `HMS_PLACE_SEARCH_ENABLED=false`
   - kalla `POST /api/admin/weather/refresh-hms-places`
   - skrá `insertRequestCount`, `durationMs`, row count og villur.
10. Prófa HMS frá localhost með search true og Google fallback false:
    `Melás`, `Melás 8`, `melas 8`, póstnúmer, multi-token og reverse lookup.
11. Ef gögn og query plans standast: með sérstöku production-env/deploy leyfi
    virkja HMS search, slökkva Google fallback og smoke-testa.
12. Virkja vikulegt refresh aðeins ef mældur import-tími er örugglega undir
    300 sekúndum. Annars þarf resumable/background import áður en cron fer í gang.

## Leyfishlið

- Skref 1–3: repo-breyting + local checks; engin production/Supabase aðgerð.
- Skref 4: sértækt commit-leyfi.
- Skref 5–7: sértækt push/deploy/Vercel-leyfi.
- Skref 8: sértækt production Supabase migration-leyfi.
- Skref 9: sértækt production-gagnaskrifsleyfi; CSV er opinbert en skrifin og
  álagið lenda á production Supabase.
- Skref 11–12: sértækt production env/refresh leyfi.

Ekki nota `Yes, and don't ask again` fyrir production, Supabase, push eða
deploy. Hvert leyfi á að vera afmarkað við viðkomandi skref.

## Áhætta sem er enn opin

- Raun import-tími, minnisnotkun og payload-stærð eru ómæld gegn production.
- In-memory rate limiter er soft guard, ekki distributed öryggismörk.
- Reverse radius 25 km þarf dreifbýlispróf.
- TODO-090 drawer og veðurvissa þurfa sjónræna localhost-staðfestingu Stebba.
- Worktree inniheldur stórt ócommittað safn breytinga; commit-scope þarf að
  staðfesta áður en commit er búið til.

## Localhost checks for Stebbi

### Áður en HMS migration/import er keyrt

1. Opna `/auth-mvp/vedrid` innskráður.
2. Á desktop/iPad breidd á „Nota núverandi staðsetningu“ ekki að sjást; á
   360–460 px á hann að sjást og permission aðeins koma eftir smell.
3. Leita að `Melás`; Google fallback má halda continuity meðan HMS er óvirkt.
4. Í Network eiga search og reverse að vera POST og hvorki query né hnit í URL.
5. Opna stóra leiðakortið og staðfesta TODO-090: Google aftast í sjálfgefinni
   röðun, caution drawer í fókus/fullri breidd og leið án nægra vindstöðva með
   takmarkaða veðurvissu.

### Eftir controlled HMS import

1. Local env: `HMS_PLACE_SEARCH_ENABLED=true` og
   `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=false`.
2. Leita að `Melás`, `Melás 8`, `melas 8`, póstnúmeri og multi-token heimilisfangi.
3. Velja niðurstöðu og staðfesta að routing noti WGS84 hnit, ekki Google placeId.
4. Prófa current location denied og allowed; denied má ekki brjóta handvirka leit.
5. Prófa reverse label á þéttbýli og dreifbýli; „Nálægt“ má ekki gefa til kynna
   nákvæmt heimilisfang.

**Varúð:** Venjuleg localhost-prófun á ekki að keyra migration, import,
road-graph refresh eða production env breytingu. Þau skref þurfa sérstakt leyfi
því aðeins production Supabase er til.

