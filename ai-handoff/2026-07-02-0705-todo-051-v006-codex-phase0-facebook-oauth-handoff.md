# TODO #51 - Codex v006 - Phase 0 handoff fyrir staðfesta Facebook OAuth-tengingu

Created: 2026-07-02 07:05
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Phase 0 handoff til Claude Code
TODO: #51 Staðfest Facebook-tenging

Refs:
- `TODO.md` #51
- `ai-handoff/2026-07-01-2208-todo-051-v002-codex-facebook-oauth-plan.md`
- `ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md`
- `ai-handoff/2026-07-01-2225-todo-051-v004-codex-review-claude-facebook-oauth.md`
- `ai-handoff/2026-07-01-2306-todo-051-v005-claude-feature-flag-og-v004-ryni.md`

## Samþykktur rammi

Stebbi bað Codex að búa til þessa handoff-skrá fyrir Claude Code.

Leyfilegt fyrir Claude Code í þessum Phase 0 áfanga, ef Stebbi sendir þessa skrá
sem framkvæmdarleyfi:

- Lesa kóðagrunninn.
- Lesa `TODO.md`, `Design.md`, `WORKFLOW.md` og viðeigandi `ai-handoff/` skjöl.
- Lesa official Supabase og Meta/Facebook docs.
- Skila nýrri handoff-skrá með niðurstöðu kortlagningar.

Ekki leyfilegt í þessum áfanga:

- Ekki breyta kóða.
- Ekki breyta `messages/`, `.env*`, config eða package skrám.
- Ekki skrifa eða keyra SQL/migration.
- Ekki breyta Supabase Dashboard, Auth settings, provider config eða secrets.
- Ekki stofna eða breyta Facebook Developer appi.
- Ekki breyta redirect URLs, production config eða deployment stillingum.
- Ekki commit-a, push-a eða deploya.

## Staðfest forsenda frá Stebba

Stebbi staðfesti: Teskeið er með feature-flag mynstur.

Þessi forsenda á að vera hluti af Phase 0 niðurstöðu, ekki opin spurning.

Staðfest mynstur í kóða:

- `.env.example` er með feature flags, meðal annars `LOANS_ENABLED`,
  `UMONNUN_ENABLED`, `UMONNUN_FLAG`, `TENGSL_ENABLED` og `TENGSL_FLAG`.
- `lib/loans/guard.ts` er með `checkFeatureAccess` og per-user lookup í
  `feature_access`.
- `middleware.ts` er með route-level kill-switch mynstur fyrir stærri route
  segments.

Líkleg v1 stefna fyrir Facebook:

- Global kill-switch, t.d. `FACEBOOK_OAUTH_ENABLED`.
- Optional per-user rollout, t.d. `FACEBOOK_OAUTH_FLAG=true` með
  `feature_access.feature_key = 'facebook-oauth'`.
- Server-side guard þarf að vera á OAuth start/action, profile UI status og
  loan invitation projection. Að fela UI eitt og sér dugar ekki.

Claude Code skal staðfesta nákvæm nöfn og staðsetningar í Phase 0, en ekki
breyta þeim enn.

## Product scope fyrir #51

V1 er staðfest Facebook OAuth-tenging sem traustmerki.

In scope:

- Innskráður Teskeið-notandi getur tengt Facebook við núverandi aðgang.
- `Minn prófíll` getur sýnt stöðu eins og `Facebook ekki tengt` og
  `Staðfest með Facebook`.
- Lánaboð eða tengslasamhengi getur sýnt að sendandi hefur staðfesta
  Facebook-tengingu, ef viðtakandi hefur raunverulegt samhengi við sendanda.
- Feature flag stýrir hver sér UI og getur byrjað OAuth-flow.

Out of scope fyrir v1:

- Enginn manual Facebook-hlekkur.
- Engin `Skrá inn með Facebook` innskráningarleið.
- Engin public/global Facebook leit.
- Engin `Skoða Facebook` slóð nema Phase 0 sannreyni örugglega að provider-gögn,
  Meta permissions og policy leyfi það.
- Facebook-staðfesting má ekki veita aðgang að lánum, tengslum eða öðrum
  notendagögnum. Hún er traustmerki, ekki heimild.

## Phase 0 verkefni

Claude Code skal kortleggja eftirfarandi read-only og skila handoff til Codex.

### 1. Núverandi auth og callback mynstur

Kortleggja:

- Login/OTP routes og server actions.
- Supabase browser/server clients.
- Auth callback routes, ef til eru.
- Session guard og middleware röð.
- Hvernig route transitions og pending states eru meðhöndluð.

Svara:

- Hvar ætti OAuth-start action að búa?
- Hvar ætti OAuth return/callback að lenda?
- Hvernig tryggjum við að Facebook linking verði ekki Facebook-login á
  innskráningarsíðu?

### 2. Supabase `linkIdentity` raunhæfni

Lesa official Supabase docs og kortleggja:

- Hvort `linkIdentity({ provider: 'facebook' })` hentar núverandi SSR/session
  mynstri.
- Hvaða setting þarf að virkja í Supabase fyrir manual identity linking.
- Hvort `linkIdentity` beta-staða sé ásættanleg áhætta fyrir v1.
- Hvernig cancel, expired callback, provider error og already-linked identity
  eiga að haga sér.
- Hvort fallback ætti að vera að fresta OAuth-staðfestingu frekar en að smíða
  custom OAuth/token layer.

Ekki breyta Supabase settings.

### 3. Facebook/Meta setup sem Stebbi þarf síðar

Kortleggja official Meta/Supabase setup:

- Hvaða Facebook app stillingar þarf fyrir local/test.
- Hvaða callback URL Supabase/Facebook þarf.
- Hvaða domains/privacy policy atriði þarf fyrir production.
- Hvaða permissions þarf fyrir v1.
- Hvort Meta App Review þarf fyrir v1 permissions og hvenær það ætti að hefjast.

Mikilvægt:

- Meta App Review er óháð App Store og Play Store.
- App Review er ekki blocker fyrir Phase 0.
- Ekki stofna eða breyta Facebook appi í þessum áfanga.

### 4. Provider metadata og hvað má birta

Kortleggja:

- Hvaða Facebook identity metadata Supabase skilar líklega eða örugglega:
  provider id, name, email, avatar, profile URL.
- Hvort v1 getur verið aðeins boolean `facebook_verified`.
- Hvort display name/avatar eru nauðsynleg eða ættu að bíða.
- Hvort profile URL fæst. Ef ekki, staðfesta að `Skoða Facebook` sé out of
  scope.

Sérstök regla:

- Ekki smíða Facebook profile URL út frá provider id eða ágiskun.
- Ekki birta raw provider id, access token, email eða metadata blob í client.

### 5. Schema/RLS þörf

Kortleggja hvort implementation þarf SQL migration.

Svara:

- Getur eigin profile UI lesið linked identity beint úr Supabase Auth án public
  projection?
- Þarf public schema projection svo aðrir notendur geti séð `Staðfest með
  Facebook` í lánaboði?
- Ef já, hvaða minimal dálkar duga, t.d. `facebook_verified_at` eða boolean?
- Hvaða RLS/grants/functions/RPC þarf svo aðeins rétt samhengi fái projection?
- Getur projection verið búin til server-side með service-role án þess að leka
  OAuth metadata?

Ekki skrifa migration í Phase 0. Skila aðeins tillögu ef SQL virðist nauðsynlegt.

### 6. Feature flag integration

Kortleggja núverandi feature-flag mynstur og leggja fram nákvæma tillögu.

Svara:

- Á Facebook að nota global-only flag eða global + per-user flag?
- Hvaða feature key ætti að nota í `feature_access`?
- Hvar þarf guard:
  - profile UI,
  - OAuth start action,
  - callback/return handling,
  - loan invitation/detail projection,
  - tests?
- Hvernig á disabled state að haga sér?
- Hvernig tryggjum við að notandi utan flags geti ekki byrjað OAuth með direct
  POST/URL?

### 7. Birting í lánaboði og tengslum

Kortleggja:

- Hvar pending invitation/detail UI sækir sendanda/upprunaaðila.
- Hvaða server payload myndi bæta við `facebook_verified`.
- Hvaða notendur mega sjá badge.
- Hvernig badge birtist án þess að breyta access control.
- Hvernig þetta hefur áhrif á `Þekki málið` og `Kannast ekki við þetta`.

### 8. Aftenging

Kortleggja:

- Supabase `unlinkIdentity` skilyrði.
- Hvort núverandi email/OTP telst sem identity þannig að Facebook megi aftengja.
- Hvað gerist ef Supabase neitar aftengingu.
- Hvort v1 á að sýna `Aftengja Facebook`, `Stjórna tengingu` eða aðeins status.

Ekki smíða custom bypass.

## Handoff sem Claude Code skal skila

Claude Code skal skila nýrri `ai-handoff/` skrá og stoppa.

Handoffið þarf að innihalda:

1. Hvað var skoðað.
2. Nákvæmar skrár og docs sem voru lesin.
3. Svör við öllum Phase 0 spurningum hér að ofan.
4. Staðfest feature-flag tillaga.
5. Hvort `linkIdentity` er mælt með eða ekki.
6. Hvort SQL migration þarf.
7. Ef SQL þarf: minimal schema/RLS/grants plan, en ekki SQL sjálft nema Stebbi
   biðji sérstaklega um það síðar.
8. Hvaða ytri Supabase/Facebook stillingar Stebbi þarf að gera síðar.
9. Áhættur sem eru enn opnar.
10. Nákvæmt implementation plan fyrir næsta áfanga, ef Phase 0 styður það.
11. Nákvæm tests sem þarf að keyra eftir implementation.
12. `Localhost checks for Stebbi`.

## Localhost checks for Stebbi

Phase 0 er read-only og hefur ekkert notendasýnilegt til að prófa á localhost.

Claude Code skal samt skila localhost checks fyrir næsta implementation áfanga.
Þau þurfa að ná yfir:

- `/stillingar/minn-profill` sýnir Facebook row/status aðeins þegar feature flag
  leyfir.
- Notandi utan feature flag sér ekkert Facebook UI og getur ekki byrjað OAuth með
  direct action/URL.
- OAuth start sýnir pending state og dauður takki verður ekki til.
- OAuth cancel, expired callback og provider error skila öruggri villu.
- Tengdur notandi sér `Staðfest með Facebook` eftir refresh.
- Lánaboð frá staðfestum sendanda sýnir badge aðeins viðtakanda sem hefur
  samhengi við boðið.
- Óviðkomandi notandi sér ekki Facebook state.
- `Þekki málið` og `Kannast ekki við þetta` virka áfram.
- Mobile 360, 390 og 460 px sýna profile row, OAuth states og lánaboð án
  zooms, overlap eða horizontal overflow.

Ekki prófa kæruleysislega:

- Ekki prófa production provider eða production redirect URLs án sérstaks
  samþykkis.
- Ekki nota raunverulega notendur eða viðkvæm Facebook account gögn án sérstaks
  samþykkis.
- Ekki logga secrets, tokens, provider metadata eða netföng í debug output.

## Óvissa / þarf að staðfesta

- Hvort `linkIdentity` beta-staða er ásættanleg eftir raunverulega kóðakortlagningu.
- Hvort Supabase manual identity linking er virkjanlegt án óæskilegra auth
  hliðarverkana.
- Hvort Facebook metadata inniheldur nokkuð sem má eða ætti að birta öðrum.
- Hvort v1 þarf SQL projection.
- Hvernig aftenging á að virka í núverandi OTP/email auth-state.
- Hvort App Review þarf fyrir endanleg v1 permissions og hvenær það á að byrja.
