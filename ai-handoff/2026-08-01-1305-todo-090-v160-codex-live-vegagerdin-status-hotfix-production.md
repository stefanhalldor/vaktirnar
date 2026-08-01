# TODO 090 — Live Vegagerðin status hotfix production handoff

Created: 2026-08-01 13:05
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti afmarkað hotfix sem gerir vindflokkun Vegagerðarstöðva í
„Af stað“ samhljóða live-stöðvum skipulagðrar ferðar, ásamt fullri
útgáfuprófun, commit, push, Vercel production-útgáfu og Gmail-tilkynningu.

## Orsök

Sérstakur `classifyFreeDriveStationWindStatus` classifier breytti öllum gömlum
eða aldursóþekktum mælingum í `no_data`, jafnvel þegar hviða eða meðalvindur var
til. Sameinaði filterinn birti því gildar vindtölur ranglega sem
„Án vindmælingar“.

## Framkvæmd

- Bætt var við einum canonical `classifyLiveVegagerdinStationWindStatus` fyrir
  route-bound og route-less live Vegagerðarstöðvar.
- Classifierinn notar hviðu þegar hún er til, annars meðalvind, og vindmörk
  notandans. Aðeins tvö vöntuð vindgildi verða `no_wind_data`.
- Freshness er áfram reiknað sjálfstætt sem `fresh`, `stale` eða `unknown` og
  núverandi viðvörun/mælitími helst óbreyttur.
- Bæði current-station og route-point adapterar, route API layer, overview,
  popup, filtertalningar og route-label builder nota sameiginlega classifierinn.
- Canonical live renderer, temperature boundary, live location og update-in-place
  marker-hegðun voru varðveitt.

## Breyttar skrár

- `app/api/teskeid/weather/travel/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/freeDrive.ts`
- `lib/weather/liveVegagerdinStation.ts`
- `lib/__tests__/free-drive.test.ts`
- `lib/__tests__/live-vegagerdin-station.test.ts`
- `lib/__tests__/road-map-free-drive-ui.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`

## Prófanir fyrir commit

- Markpróf, 5 files / 45 tests: exit `0`.
- `npm run type-check`: exit `0`.
- Full `npm run test:run`: exit `0`; 228 passed / 1 skipped files,
  4751 passed / 28 skipped / 8 todo tests.
- `npm.cmd run lint`: exit `0`; aðeins fyrirliggjandi warnings.
- `npm run build`: exit `0`; production build og 119 static pages kláruð.
- `git diff --check`: exit `0`.
- Fyrsta `npm run lint` invocation ræstist ekki vegna Windows PowerShell
  execution-policy fyrir `npm.ps1`; sama script var endurkeyrt með `npm.cmd`
  og stóðst.

## Design og route intelligence check

Engin ný layout- eða component-hönnun var gerð. Hotfixið endurnýtir samþykkt
mobile live-stöðvaspjald, filtera og update-in-place hegðun í samræmi við
`Design.md`. Breytingin snertir ekki leiðarval, vegkafla, provider routing,
route-family eða route-gagnageymslu. `IcelandRoadmap.md` var því ekki uppfært.

## Gögn og öryggi

Engin SQL-skrá, migration, Supabase-, RLS-, auth-, env-, secret- eða
notendagagnabreyting var gerð. Freshness-viðvörun var ekki veikt eða fjarlægð;
hún er aðeins aðskilin frá lit/labeli skráðu vindtölunnar.

## Óvissa / þarf að staðfesta

Sjálfvirk próf staðfesta classifier-parity og wiring. Production-prófun Stebba
á raunverulegu gamla Vegagerðarsafni staðfestir endanlega talningar og liti.

## Localhost checks for Stebbi

Á `/auth-mvp/vedrid` sem innskráður notandi:

1. Veldu „Af stað“ og vindmörkin 10/15 m/s.
2. Opnaðu landskortið þegar Vegagerðarmælingar eru merktar gamlar.
3. Staðfestu að stöðvar með vindtölur flokkist í grænt/gult/appelsínugult/rautt
   eftir mörkunum og að filtertalningar passi.
4. Staðfestu að „Án vindmælingar“ telji aðeins stöðvar þar sem bæði hviðu og
   meðalvind vantar.
5. Staðfestu að viðvörun um gamlar mælingar og mælitímar haldist sýnileg.
6. Prófaðu sömu mörk í live location skipulagðrar ferðar og staðfestu sömu
   liti/labels fyrir sömu stöðvar.
7. Passaðu sérstaklega að live location og stöðvaspjöld blikki ekki eða hoppi.

Engin database- eða auth-aðgerð er hluti af þessum checks.
