# TODO 090 v013 — Strict per-user Teskeiðarleiðakerfi

Created: 2026-07-26 11:31
Timezone: Atlantic/Reykjavik

## Samþykkt framkvæmd

Stebbi samþykkti að Codex gerði kóða-, prófa- og migration-skrárbreytingar sem gera Teskeiðarleiðakerfið útgáfuhæft undir per-user flaggi. Stebbi keyrir SQL sjálfur og setur env-breytuna sjálfur.

Ekki samþykkt og ekki gert: commit, push, deploy, migration-keyrsla, Vercel-breyting, Supabase/production-breyting eða breyting á notendagögnum.

## Plan áfangans

1. Nota núverandi `feature_access` kjarna með nýjum feature-key.
2. Gera gate-inn strict: global kill-switch og per-user röð þurfa bæði að vera til staðar.
3. Gera client/UI, candidate API, route-options API og final-submit API fail-closed.
4. Bæta stýringu við admin notendalistann.
5. Skrifa idempotent migration sem Stebbi getur keyrt sjálfur.
6. Prófa kill-switch, notanda með/án leyfis, public lokun og direct API bypass.

## Hvað var raunverulega gert

- Nýr feature-key `teskeid-routing-v1` var bættur við sameiginlega `checkFeatureAccess` guardinn.
- `TESKEID_ROUTE_CANDIDATE_ENABLED` er áfram global kill-switch og er exact opt-in. Ósett, tómt, `false`, `TRUE` eða annað gildi lokar virkninni.
- Gate-inn er strict: jafnvel þegar env er nákvæmlega `true` þarf canonical email notandans að eiga `feature_access` röð með `teskeid-routing-v1`. Engin open-to-all graduation leið er til í þessum áfanga.
- `/auth-mvp/vedrid` reiknar aðgang server-side og sendir clientinum aðeins `teskeidRouteCandidateEnabled=true` fyrir leyfðan notanda.
- Public `/vedrid` sendir alltaf `teskeidRouteCandidateEnabled=false`.
- `/api/teskeid/weather/travel/route-candidate` krefst innskráðs og leyfðs notanda og sleppir vegagrafsvinnu alveg ef aðgang vantar.
- Gamla `/api/teskeid/weather/travel/routes` bætir aðeins Teskeið-candidate við fyrir leyfðan notanda.
- Final-submit `/api/teskeid/weather/travel/route` hafnar primary og alternative Teskeið route-id áður en graph lookup fer fram ef aðgang vantar. Svarið er almenna `selected_route_unavailable`, svo feature-aðgangur leki ekki.
- Admin feature-access API allowlist styður `teskeid-routing-v1`.
- Admin-síðan sýnir nýjan kafla „Teskeiðarleiðakerfi (v1)“ þar sem má veita og afturkalla aðgang með netfangi.
- `.env.example` og `lib/iceland-routes/README.md` lýsa tveggja lykla skilyrðinu: env + per-user row.
- Ný migration `sql/91_feature_access_teskeid_routing_v1.sql` bætir keynum við CHECK constraint.

## Af hverju aðeins ein env-breyta

Fyrri planhugmynd gerði ráð fyrir sérstakri `ACCESS_REQUIRED` breytu. Við framkvæmd var valin einfaldari og öruggari leið:

- `TESKEID_ROUTE_CANDIDATE_ENABLED=true` opnar aðeins server capability.
- `feature_access` röð er alltaf skyldubundin.

Þetta passar við ósk Stebba um per-user rollout og kemur í veg fyrir að gleymd önnur env-breyta opni virkni fyrir alla. Ef graduation verður síðar er hægt að bæta henni við sem sérstökum, yfirförnum áfanga.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `app/(admin)/admin/page.tsx`
- canonical og public Veðrið pages
- öll þrjú route API entry points
- núverandi feature-access migrations og prófamynstur
- `next.config.js`

## Skrár sem voru breyttar í per-user áfanganum

- `lib/loans/guard.ts`
- `app/api/admin/feature-access/route.ts`
- `app/(admin)/admin/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/vedrid/page.tsx`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `.env.example`
- `lib/iceland-routes/README.md`
- `lib/__tests__/guard.test.ts`
- `lib/__tests__/feature-access-api.test.ts`
- `lib/__tests__/admin-page.test.tsx`
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- `lib/__tests__/weather-route-candidate-api.test.ts` (ný)
- `lib/__tests__/weather-page-routing-access.test.tsx` (ný)
- `sql/91_feature_access_teskeid_routing_v1.sql` (ný, ekki keyrð)
- þessi handoff-skrá

Ótengdar og eldri ócommittaðar breytingar voru varðveittar. Tímabundin `next.config.js` build-output stilling var tekin alveg aftur út; working-tree hash skráarinnar er sá sami og í HEAD og `git diff` sýnir enga efnisbreytingu.

## Skipanir og niðurstöður

- Fyrsta afmarkaða keyrsla fann eitt vantað import; ekkert annað testasvæði brást.
- Endurtekin afmörkuð keyrsla: 6 skrár, 235/235 próf græn.
- Afmörkuð keyrsla eftir page-boundary próf: 7 skrár, 238/238 próf græn.
- `npm run type-check`: exit 0, keyrt aftur eftir lokabreytingar.
- Fullt `npm run test:run`: exit 0; 147 test files passed, 1 skipped; 3.696 próf passed, 28 skipped, 8 todo.
- `git diff --check`: exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- Þýðinga-JSON parse: exit 0.
- Einangrað `npm run build` með sér build-möppu: náði ekki compile vegna þess að sandbox bannaði Google Fonts netaðgang (`next/font` Inter, EACCES).
- Beiðni um netvæddan build var hafnað vegna þess að build-ferlið getur lesið `.env.local` og hefði þá almennan outbound netaðgang. Engin framhjáleið var reynd.
- Tímabundna `.next-codex-build` mappan var staðfest sem nákvæm workspace-slóð og eytt. Hún er ekki endurheimtanleg en innihélt aðeins generated build artifacts.

## Hvað var sleppt

- Fullt production-build er eina sjálfvirka validation-gatið. Fyrri venjuleg build-keyrsla compile-aði kóðann en lenti í `.next` árekstri við dev-server í page-data skrefi. Einangraða keyrslan eftir þessa breytingu komst ekki að compile vegna font-netbanns.
- Codex stöðvaði hvorki né endurræsti localhost.
- SQL var ekki keyrt.
- Engin admin-röð var búin til.
- Env var ekki breytt.
- Ekkert var commit-að, push-að eða deployað.

## Supabase / SQL rýni

SQL-skrá: `sql/91_feature_access_teskeid_routing_v1.sql`.

- Keyrð: nei.
- Schema-áhrif: endurskapar aðeins `feature_access_feature_key_check` og bætir einu leyfðu gildi við.
- Gögn: engum röðum breytt, eytt eða bætt við.
- RLS: óbreytt og áfram enabled.
- Grants: óbreytt; taflan er áfram service-role only.
- Auth/policies/functions: óbreytt.
- Transaction: já, `BEGIN`/`COMMIT`.
- Idempotency: constraint er `DROP ... IF EXISTS` og síðan endurskapað með allri núverandi allowlistunni.
- Rollback: fylgir kommentaður; hann mistekst viljandi ef `teskeid-routing-v1` raðir hafa ekki verið fjarlægðar fyrst.
- Production-áhrif ef keyrt: gerir admin/API kleift að setja nýja feature-keyinn, en opnar enga virkni sjálfkrafa.

## Route intelligence check

- Breytingin snertir aðgang að öllum Teskeiðarleiðum úr nýja vegagrafinu, ekki eina route-family eða landshluta.
- Engin ný segment-, control-point-, caution-, station-matching- eða cache-þekking var bætt við.
- Route-domain kjarninn er áfram provider-neutral í `lib/iceland-routes/`; access-gate er utan reiknialgoritmans.
- `IcelandRoadmap.md` var ekki uppfært í þessum áfanga vegna þess að engri nýrri leiðaþekkingu eða architecture-áætlun var bætt við.
- `feature_access` geymir aðeins canonical email + feature-key, aldrei lat/lon, heimilisfang, polyline eða ferðasögu.

## Ákvarðanir og eftirstandandi áhætta

- UI-gate eitt og sér var ekki talið nægilegt; öll API entry points eru líka lokuð server-side.
- Unauthorized og stale Teskeið route-id fá sama `selected_route_unavailable` svar til að forðast access-oracle.
- Public weather fær ekki Teskeiðarleiðir í strict rolloutinu.
- Migration þarf að vera keyrð áður en admin getur sett fyrstu `teskeid-routing-v1` röðina; annars hafnar gamla CHECK constraint insertinu.
- Env ósett er öruggt og fail-closed.
- Fullt build þarf að staðfesta áður en push/deploy er samþykkt.

## Spurningar sem Claude Code á sérstaklega að rýna

1. Er einhver fjórða route-candidate entry point eða server action sem getur farið fram hjá þessum þremur API guards?
2. Er `selected_route_unavailable` rétt fail-closed svar fyrir direct unauthorized final-submit eða ætti það að vera 404 án þess að breyta client-hegðun?
3. Er migration 91 í fullu samræmi við raunverulega production constraint eftir migrations 89 og 90?
4. Sér Claude Code concurrency/cache vandamál ef admin afturkallar aðgang meðan clientinn er opinn? Núverandi ákvörðun er að næsta API-kall fail-closed, án client push invalidation.
5. Staðfesta að engin user-facing þýðanleg textabreyting hafi verið hardcode-uð í canonical app UI; admin er áfram á núverandi íslenska admin-mynstri.
6. Keyra production-build þegar hægt er án localhost `.next` áreksturs og án óafmarkaðs secret-egress.

## Localhost checks for Stebbi

### Undirbúningur

1. Keyrðu `sql/91_feature_access_teskeid_routing_v1.sql` í Supabase þegar Stebbi er tilbúinn. Þetta er schema-write en breytir ekki röðum, RLS eða grants.
2. Hafðu `TESKEID_ROUTE_CANDIDATE_ENABLED=true` í `.env.local` og endurræstu localhost sjálfur svo serverinn lesi env aftur.
3. Opnaðu admin og finndu „Teskeiðarleiðakerfi (v1)“.

### Notandi án aðgangs

1. Fjarlægðu prófunarnetfangið úr Teskeiðarleiðalistanum eða notaðu annan innskráðan notanda.
2. Opnaðu `/auth-mvp/vedrid`, farðu í Akstur og reiknaðu leið.
3. Vænt: Google-leiðir virka óbreyttar; engin Teskeiðarleið, Teskeið-loader eða „Finna fleiri Teskeiðarleiðir“ birtist.
4. Vænt í console/network: ekkert candidate request sem skilar route; direct candidate kall er 404/disabled og graph-vinna fer ekki af stað.

### Notandi með aðgang

1. Veittu eigin netfangi aðgang í admin-listanum.
2. Refresh-aðu `/auth-mvp/vedrid` og reiknaðu sömu leið aftur.
3. Vænt: Google-leiðir birtast fyrst og Teskeiðarleiðir hlaðast undir flagginu.
4. Veldu primary og alternative Teskeiðarleið, preview-aðu kortið og ýttu á „Skoða veðurskilyrði fyrir þessa leið“.
5. Vænt: final-submit reiknar valda Teskeiðarleið og veðurviðmótið birtist án 422/503.
6. Afturkallaðu aðgang í admin meðan síðan er opin og reyndu nýtt candidate/final-submit kall.
7. Vænt: næsta server-kall lokast fail-closed; refresh fjarlægir Teskeiðar-UI alveg.

### Kill-switch

1. Fjarlægðu `TESKEID_ROUTE_CANDIDATE_ENABLED` eða settu annað en nákvæmlega `true`, og endurræstu localhost sjálfur.
2. Prófaðu leyfða notandann aftur.
3. Vænt: Teskeiðarleiðakerfið er lokað þrátt fyrir að netfangið sé enn í admin-listanum; Google-flæðið virkar áfram.

### Mobile regressions

1. Prófaðu um 360, 390, 430 og 530 px breidd.
2. Staðfestu að admin input/takki og Akstursflæðið valdi ekki zoom-i, overlap-i eða láréttu overflowi.
3. Staðfestu að loader, progressive spátöflubirting og edit-penni haldist óbreytt fyrir leyfðan notanda.

Ekki prófa production, Vercel env, migration eða raunnotendur kæruleysislega. Stebbi sér sjálfur um SQL og env; commit/push/deploy þarf enn sérstakt samþykki eftir Claude Code review og localhost-prófanir.

## Tillaga að næsta skrefi

Stebbi sendir þessa skrá til Claude Code í gagnrýna code review á meðan localhost-prófanirnar eru keyrðar. Ef review og localhost eru græn þarf að keyra fullan production-build áður en Stebbi samþykkir commit/push/deploy.
