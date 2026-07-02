# TODO #51 - Codex v004 - Rýni á Claude v003 Facebook OAuth

Created: 2026-07-01 22:25
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Review handoff til Claude Code
Refs:
- `ai-handoff/2026-07-01-2208-todo-051-v002-codex-facebook-oauth-plan.md`
- `ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md`

Þetta er rýni á Claude Code v003. Engin implementation hefur verið framkvæmd í
þessari rýni.

## Findings

### Medium - App Review er process-áhætta, en ekki Phase 0 blocker

`ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md:32`

Claude Code hefur rétt fyrir sér að Meta/Facebook process getur tafið production
fyrir almenna notendur. En v003 gerir þetta of mikið að forsendu áður en Phase 0
hefst. Phase 0 á að vera read-only kortlagning á repo, núverandi auth-flow,
Supabase/Facebook stillingaþörf og testability. Það þarf ekki að hefja Meta App
Review áður en sú kortlagning hefst.

Leiðrétting:

- Phase 0 má hefjast án Meta App Review.
- Ekki hefja App Review fyrr en Phase 0 veit hvaða permissions/gögn v1 þarf.
- App Review er óháð App Store / Play Store. Hér er verið að tala um Meta
  Developer App Review fyrir Facebook OAuth app, ekki native app store review.
- Tímalína Claude, `1-4 vikur`, er of ákveðin. Supabase docs nefna að Facebook
  app review sé oft 1-5 business days, en höfnun eða vöntun á privacy policy,
  domain setup, screencast eða permissions-rökstuðningi getur lengt þetta.

Heimild:
https://supabase.com/docs/guides/auth/social-login/auth-facebook

### Medium - `linkIdentity` beta er raunveruleg áhætta sem Phase 0 á að mæla

`ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md:23`

Claude Code flaggar rétta áhættu. Supabase docs merkja manual identity linking
sem beta, svo implementation má ekki byggja blindandi á því. En þetta á ekki að
stöðva Phase 0. Það á að gera Phase 0 skýrari.

Phase 0 þarf að svara:

- Er `linkIdentity({ provider: 'facebook' })` nothæft með núverandi SSR/session
  mynstri í Teskeið?
- Hvað gerist við cancel, expired callback, provider error og already-linked
  identity?
- Er til stöðugri leið með Supabase Auth sem heldur Facebook sem linked identity
  en bætir ekki við `Skrá inn með Facebook` í login UI?
- Ef `linkIdentity` breytist eða reynist óstöðugt, hver er fallback niðurstaðan?
  Mín tillaga: fallback er að fresta OAuth-staðfestingu frekar en að smíða
  custom token-geymslu eða custom Facebook OAuth layer.

Heimild:
https://supabase.com/docs/guides/auth/auth-identity-linking

### Medium - Ekki gera ráð fyrir `Skoða Facebook` í v1

`ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md:45`

Claude Code er líklega réttur: opnanleg Facebook prófílslóð er ekki örugg v1
forsenda. Codex v002 sagði að ekki mætti lofa `Skoða Facebook` nema provider
gögn og permissions styðji það. Það þarf að herða product-scope:

- V1 success criteria er boolean traustmerki: `Staðfest með Facebook`.
- `Skoða Facebook` er out of scope nema Phase 0 sannreyni örugglega að
  provider-gögn, Meta permissions og policy leyfi það.
- Ef aðeins fæst provider id / nafn / avatar / email, skal ekki reyna að smíða
  prófílslóð með ágiskun.

### Medium - `manual_linking_enabled` má ekki vera ágiskun

`ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md:60`

Claude Code má ekki gera ráð fyrir nákvæmu Dashboard state eða exact config
heiti án staðfestingar. Þetta er rétt sem áhætta, en Phase 0 á að orða þetta sem
staðfestingaratriði:

- Hvaða Supabase setting þarf nákvæmlega fyrir manual identity linking?
- Er hún sýnileg í Dashboard fyrir þetta project?
- Er hún þegar virk?
- Ef ekki, hvaða skref þarf Stebbi að gera síðar?

Ekki breyta stillingunni í Phase 0.

### Medium - Aftenging þarf að vera ákvörðunarpunktur, ekki bara edge case

`ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md:82`

Claude Code hefur rétt fyrir sér. V1 má ekki lofa `Aftengja Facebook` án þess að
Phase 0 staðfesti Supabase `unlinkIdentity` skilyrði og hvernig þau tengjast
núverandi OTP/email aðgangi.

Phase 0 þarf að svara:

- Telst núverandi email/OTP sem identity þannig að Facebook megi aftengja?
- Hvað gerist ef Facebook er eina OAuth identity en notandi hefur email/OTP?
- Hvað gerist ef Supabase neitar aftengingu?
- Á v1 að sýna `Aftengja Facebook`, `Stjórna tengingu`, eða aðeins lesa stöðu?

Ekki smíða custom bypass í kringum `unlinkIdentity`.

### Low - Complexity er samþykkt product-val, en scope þarf að vera strangt

`ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md:66`

Claude Code bendir réttilega á að þetta er mikið effort fyrir eitt badge. Stebbi
hefur samt skýrt áhuga á að keyra á staðfesta tengingu, ekki manual hlekk.
Því er þetta ekki blocker, en það styrkir að v1 scope eigi að vera þröngt:

- Enginn manual hlekkur.
- Ekkert Facebook-login á innskráningarsíðu.
- Engin public/global Facebook leit.
- Engin profile URL nema sannreynt.
- Fyrst `Staðfest með Facebook` í `Minn prófíll` og lánaboða-/tengslasamhengi.

## Niðurstaða Codex

Claude Code v003 er gagnlegt og rétt að stærstum hluta, en rauðu fánarnir eiga
ekki að stoppa Phase 0. Þeir eiga að verða explicit svör í Phase 0 handoff.

Ráðlagt næsta skref:

Claude Code má gera Phase 0 read-only kortlagningu ef Stebbi gefur skýrt leyfi.
Phase 0 má ekki fela í sér kóðabreytingu, SQL, migration, Supabase/Facebook
stillingar, secrets, commit, push eða deploy.

## Afmarkað Phase 0 verkefni fyrir Claude Code

Claude Code skal:

- Lesa núverandi profile route, auth callback/session mynstur, Supabase clients,
  middleware, messages og loan invitation/detail payload.
- Lesa official Supabase/Meta docs sem þarf fyrir `linkIdentity`, Facebook
  provider setup, development mode, permissions og unlink.
- Kortleggja hvort `linkIdentity({ provider: 'facebook' })` passar við núverandi
  kóða án þess að bæta Facebook-login við login UI.
- Staðfesta hvaða ytri stillingar Stebbi þyrfti síðar að gera í Supabase
  Dashboard og Meta Developers.
- Svara hvort v1 getur verið aðeins boolean `facebook_verified`, eða hvort
  schema projection þarf.
- Svara hvort opnanleg profile URL fæst. Ef ekki, staðfesta að `Skoða Facebook`
  verði ekki í v1.
- Svara hvernig aftenging virkar eða hvort hún á að bíða.
- Skila handoff til Codex áður en implementation hefst.

## Spurningar sem Phase 0 handoff þarf að svara

1. Hvaða núverandi auth/callback/profile mynstur eru í repo?
2. Er `linkIdentity` raunhæft og hvað þarf að virkja utan repo?
3. Hvaða exact Supabase/Facebook setup þarf Stebbi síðar?
4. Fæst bara boolean verified state eða líka display name/avatar/profile URL?
5. Þarf SQL migration fyrir minimal projection? Ef já, hvaða RLS/grants?
6. Hvernig birtist badge örugglega í lánaboði án gagnaleka?
7. Hvernig virkar aftenging?
8. Hvaða tests og Localhost checks verða nauðsynleg eftir implementation?

## Ekki gera í Phase 0

- Ekki breyta kóða.
- Ekki skrifa eða keyra SQL/migration.
- Ekki breyta Supabase Dashboard.
- Ekki stofna eða breyta Facebook Developer appi.
- Ekki snerta secrets, redirect URLs eða production config.
- Ekki commit-a, push-a eða deploya.

## Localhost checks for Stebbi

Phase 0 er read-only og hefur ekkert notendasýnilegt til að prófa á localhost.

Í Phase 0 handoff skal Claude Code samt skila nákvæmum localhost-prófunum fyrir
næsta implementation áfanga. Þau checks þurfa að ná yfir:

- `/stillingar/minn-profill` Facebook row/status.
- OAuth start, return, cancel, expired callback og provider error.
- Loading/pending state svo takkinn virðist ekki dauður.
- Lánaboð þar sem sendandi hefur staðfesta Facebook-tengingu.
- Að óviðkomandi notandi sjái ekki Facebook state.
- Að `Þekki málið` og `Kannast ekki við þetta` virki áfram.
- Mobile 360, 390 og 460 px án zooms, overlap eða horizontal overflow.

Ekki má prófa production provider, production redirect URLs, real user Facebook
accounts eða secrets án sérstaks samþykkis Stebba.

## Óvissa / þarf að staðfesta

- Hvort Supabase manual identity linking er virkt eða þarf stillingu.
- Hvort `linkIdentity` beta-staða er ásættanleg eftir raunverulega Phase 0
  kortlagningu.
- Hvort Facebook identity metadata inniheldur nokkuð sem má birta öðrum.
- Hvort App Review verður yfirhöfuð þörf fyrir þau permissions sem v1 endar á að
  nota.
- Hvort v1 þarf SQL projection eða getur birt verified state án nýs schema.
