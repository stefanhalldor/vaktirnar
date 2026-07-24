# TODO-091 v011 — Road Intelligence graduation gate og admin-stýring

## Plan áfangans

1. Samræma Road Intelligence við tveggja þrepa feature-flag/kill-switch mynstur verkefnisins.
2. Aðlaga admin-spjaldið að global kill-switch og valfrjálsum per-user lista.
3. Skjalfesta env-breyturnar.
4. Uppfæra truth-table próf og keyra build.

## Hvað var raunverulega gert

- `road-intelligence-v1` fylgir nú þessari aðgangsröð:
  1. `WEATHER_ENABLED` verður að vera virkt.
  2. `ROAD_INTELLIGENCE_V1_ENABLED=true` verður að vera til staðar sem global kill-switch.
  3. Ef `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED=true`, þarf notandinn `road-intelligence-v1` færslu í `feature_access`.
  4. Ef `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED` er ósett eða false fá allir gjaldgengir innskráðir veðurnotendur aðgang.
- Engin database-fyrirspurn er gerð í opna/graduated hamnum.
- Miðlæga `checkFeatureAccess` breytingin nær sjálfkrafa yfir:
  - prototype-síðuna;
  - hlekkinn á Veðrinu;
  - öll fimm Road Intelligence API-endpoints.
- Admin-spjaldið:
  - vísar nú á `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED` sem breytuna sem virkjar listann;
  - sýnir `ROAD_INTELLIGENCE_V1_ENABLED` sem global opnunarskilyrði;
  - útskýrir að ósett/false `ACCESS_REQUIRED` opni fyrir alla gjaldgenga veðurnotendur.
- `.env.example` skjalfestir báðar breyturnar og graduation-leiðina.
- Guard-prófin ná nú yfir fulla truth table.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `lib/loans/guard.ts`
- `lib/weather/weatherEnabledMode.server.ts`
- `lib/weather/weatherBaseAccess.server.ts`
- `app/(admin)/admin/page.tsx`
- `app/api/admin/feature-access/route.ts`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- Road Intelligence API route guards
- `lib/__tests__/guard.test.ts`
- `.env.example`

## Skrár sem voru breyttar

- `lib/loans/guard.ts`
- `lib/__tests__/guard.test.ts`
- `app/(admin)/admin/page.tsx`
- `.env.example`
- `ai-handoff/2026-07-24-2118-todo-091-v011-codex-road-intelligence-graduation-gate.md`

Ótengdar breytingar á `.obsidian/workspace.json` og endurnefning v006 handoffs voru ekki snertar.

## Skipanir sem voru keyrðar

- `npm.cmd run test:run -- lib/__tests__/guard.test.ts`
  - Exit code 0; 121 af 121 prófum stóðust.
- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run build`
  - Exit code 0.
  - Production build kláraðist með fyrirliggjandi lint-viðvörunum.
- `git diff --check`
  - Engar whitespace-villur; aðeins line-ending viðvaranir.

## Hvað mistókst eða var sleppt

- Engin skipun mistókst.
- Engum Vercel env-breytum var breytt.
- Ekkert production/Supabase state var skoðað eða breytt.
- Ekkert commit, push eða deploy var gert.

## Ákvarðanir

- Nýr per-user gate heitir `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED`, í samræmi við nýrri Veðurstofu-, Vegagerðar- og Veðurpúlsmynstur.
- `ROAD_INTELLIGENCE_V1_ENABLED` var varðveitt sem fail-closed global kill-switch.
- `WEATHER_ENABLED` er yfirskipað parent gate þar sem Road Intelligence er undirhluti Veðursins.
- Admin-listinn er áfram sýnilegur og editable í graduated ham; færslurnar hafa þá engin áhrif fyrr en `ACCESS_REQUIRED=true` er sett aftur.

## Áhætta sem er enn til staðar

- Ef `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED` er eytt úr Vercel áður en þessi kóði er deployaður breytist ekkert; gamli kóðinn krefst áfram feature-access. Röðin þarf því að vera deploy fyrst, env-breyting síðan.
- Ef `ROAD_INTELLIGENCE_V1_ENABLED` er eytt lokast allt fyrir alla.
- Admin-spjaldið les ekki raunverulegt Vercel env-state; það útskýrir aðeins merkingu breytanna og heldur utan um feature-access listann.
- Hlekkurinn „Útgáfa 2 (í þróun)“ var ekki færður í þessum áfanga; þessi breyting fjallar aðeins um aðgangsstýringu og admin.

## Tillaga að næsta skrefi

1. Stebbi staðfestir localhost truth table.
2. Commit/deploy kóðabreytinguna.
3. Eftir staðfest deploy:
   - halda `ROAD_INTELLIGENCE_V1_ENABLED=true`;
   - eyða `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED` til að opna fyrir alla gjaldgenga veðurnotendur.
4. Ekki eyða global `ENABLED` breytunni nema markmiðið sé að loka virkninni.

## Spurningar fyrir næstu rýni

1. Á prototype-síðan að vera opin öllum innskráðum veðurnotendum eða einnig public veðurnotendum? Núverandi niðurstaða er aðeins innskráðir.
2. Á admin-spjaldið síðar að sýna raunverulegt env-state frá server, eða er skýringartextinn nægur?
3. Á næsti áfangi að færa subtle „Útgáfa 2 (í þróun)“ hlekkinn undir Ferðalagið CTA?

## Supabase

Engin SQL-skrá var skrifuð eða keyrð. `feature_access` gögn, RLS, auth, grants, policies, functions og production voru ekki snert.

Í graduated ham eru fyrirliggjandi `road-intelligence-v1` feature-access færslur varðveittar en ekki notaðar. Ef `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED=true` er sett aftur taka þær strax gildi.

## Localhost checks for Stebbi

Athugið: env-breyting krefst þess venjulega að Stebbi endurræsi sinn eigin localhost server. Codex ræsti eða endurræsti hann ekki.

Prófaðu:

`/auth-mvp/vedrid`

og:

`/auth-mvp/vedrid/road-map-prototype`

Truth-table:

1. `WEATHER_ENABLED` óvirkt, `ROAD_INTELLIGENCE_V1_ENABLED=true`.
   - Hlekkur og prototype eiga að vera lokuð.
2. `WEATHER_ENABLED=Authenticated`, `ROAD_INTELLIGENCE_V1_ENABLED` ósett.
   - Lokað fyrir alla.
3. `WEATHER_ENABLED=Authenticated`, `ROAD_INTELLIGENCE_V1_ENABLED=true`, `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED=true`.
   - Aðeins notendur á `road-intelligence-v1` admin-listanum fá hlekk og síðu.
4. Sama og 3, en notandi fjarlægður af listanum.
   - Hlekkur hverfur og prototype skilar 404.
5. `WEATHER_ENABLED=Authenticated`, `ROAD_INTELLIGENCE_V1_ENABLED=true`, `ROAD_INTELLIGENCE_V1_ACCESS_REQUIRED` ósett eða false.
   - Allir innskráðir veðurnotendur fá hlekk og prototype-aðgang.
   - Road Intelligence API-köll eiga ekki að skila feature-gate 404.
6. Opnaðu admin og skoðaðu „Road Intelligence kort (v1)“.
   - Textinn á að segja að `ENABLED=true` opni virknina.
   - Textinn á að segja að listinn gildi aðeins með `ACCESS_REQUIRED=true`.
   - Grant/remove á listanum á áfram að virka.

Öryggisvarúð:

- Ekki prófa env-breytingar beint í production án deploy-röðar og rollback-plans.
- Engin SQL eða breyting á user data er nauðsynleg fyrir þessi localhost-próf.
- Global rollback er að setja `ROAD_INTELLIGENCE_V1_ENABLED=false`, ekki að breyta feature-access listanum.
