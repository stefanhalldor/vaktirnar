# TODO #51 - Codex v002 - Staðfest Facebook OAuth-tenging

Created: 2026-07-01 22:08
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Implementation plan for Claude Code

## Samþykktur rammi

Stebbi bað Codex að uppfæra #51 í `TODO.md` og búa til plan fyrir Claude Code.

Þetta plan veitir ekki leyfi til að framkvæma kóðabreytingu, SQL/migration,
Supabase/Facebook provider-stillingu, commit, push, deploy eða production
breytingu. Claude Code þarf skýrt og afmarkað framkvæmdarleyfi frá Stebba áður
en eitthvað af því er gert.

## Product ákvörðun

Facebook í Teskeið á ekki að vera manual hlekkur.

V1 á að vera staðfest Facebook-tenging með OAuth/identity linking:

- Innskráður notandi tengir Facebook við núverandi Teskeið-aðgang.
- Teskeið má sýna traustmerki, t.d. `Staðfest með Facebook`, í afmörkuðu
  samhengi.
- Þetta er ekki Facebook-login í fyrstu útgáfu.
- Þetta er ekki global leitarskrá yfir Facebook-notendur.
- Þetta er ekki heimild til að sjá lán, gögn eða tengsl.

Fyrsta notkunin er að viðtakandi lánaboðs geti betur séð hvort sendandi sé rétti
aðilinn áður en hann smellir á `Þekki málið`.

## Opinber docs sem plan byggir á

- Supabase Identity Linking:
  https://supabase.com/docs/guides/auth/auth-identity-linking
  - Styður manual identity linking fyrir innskráðan notanda með `linkIdentity`.
  - `unlinkIdentity` krefst þess að notandi sé innskráður og hafi að minnsta
    kosti tvær linked identities.
  - Manual linking er merkt beta í docs, svo þetta þarf extra rýni.

- Supabase Facebook Auth:
  https://supabase.com/docs/guides/auth/social-login/auth-facebook
  - Krefst Facebook OAuth application og credentials í Supabase Dashboard.
  - Callback URL er Supabase auth callback, t.d.
    `https://<project-ref>.supabase.co/auth/v1/callback`.
  - Supabase docs nefna `public_profile` og `email` sem Facebook app
    permissions/use-case stillingar.
  - Development mode takmarkar prófanir við users með app role/tester access.

Claude Code skal staðfesta docs aftur áður en implementation hefst, því þetta
snertir auth, provider-stillingar og ytri platform-reglur.

## Phase 0 - preflight og ákvörðunarpunktar

Claude Code skal byrja á read-only kortlagningu og stoppa með handoff til Codex
áður en implementation hefst.

Kortleggja:

- Núverandi `/stillingar/minn-profill` route, form, server actions, messages og
  profile data model.
- Núverandi auth callback/OTP/session mynstur og hvort til sé reusable Supabase
  browser/server client fyrir OAuth redirect flow.
- Hvort verkefnið notar eða getur notað Supabase `linkIdentity({ provider:
  'facebook' })` án þess að setja Facebook login á innskráningarsíðuna.
- Hvort Supabase manual identity linking þarf sérstaka Auth-stillingu sem Stebbi
  þarf að virkja.
- Hvaða identity metadata Supabase skilar fyrir Facebook í raun í þessu projecti:
  provider id, nafn, avatar, email og hvort opnanleg prófílslóð fæst.
- Hvernig núverandi loan invitation/detail payload sækir sendanda/upprunaaðila
  og hvar væri öruggast að bæta við `facebook_verified`/display metadata.
- Hvort hægt er að sýna aðeins boolean traustmerki í v1 án þess að geyma eða
  birta persónugögn frá Facebook.

Phase 0 handoff þarf að svara:

- Er `linkIdentity` raunhæft hér eða þarf custom OAuth flow?
- Hvaða ytri stillingar þarf Stebbi að gera í Facebook/Supabase áður en þetta
  er prófanlegt?
- Þarf SQL migration? Ef já, nákvæmlega hvaða minimal schema og hvaða RLS/grants?
- Má sýna `Skoða Facebook`, eða aðeins `Staðfest með Facebook` í v1?
- Hvernig aftenging virkar ef Supabase krefst að notandi hafi að minnsta kosti
  tvær identities.

## Möguleg implementation stefna eftir samþykki

Þetta er ekki framkvæmdarleyfi, bara tillaga að röð.

1. Bæta við profile UI á `/stillingar/minn-profill`
   - Status row: `Facebook ekki tengt` / `Staðfest með Facebook`.
   - Secondary action: `Tengja Facebook`.
   - Ef tengt: `Aftengja Facebook` eða `Stjórna tengingu`.
   - Hafa pending/error states og redirect-return feedback.

2. OAuth/link flow
   - Nota Supabase client sem passar núverandi SSR/session mynstri.
   - Fyrir tengingu nota `linkIdentity({ provider: 'facebook' })` ef Phase 0
     staðfestir að það sé örugg leið.
   - Nota öruggt `redirectTo`/callback með relative `next` eða sambærilegu
     allow-list mynstri.
   - Ekki bæta Facebook við almennar login actions í v1.

3. Staðfestingargögn
   - Fyrir eigin notanda má lesa linked identities með Supabase Auth API.
   - Fyrir aðra notendur má client aðeins fá lágmarks projection sem server hefur
     ákveðið að sé sýnileg í viðkomandi samhengi.
   - Forðast að birta raw provider id, email, access token eða metadata blob.
   - Ef geyma þarf projection í public schema, nota minimal dálka, t.d.
     `facebook_verified_at`, `facebook_display_name` eða `facebook_avatar_url`
     aðeins ef sannreynt er að provider gögn megi geyma/birta.

4. Birting í lánaboði
   - Pending invitation/detail UI má sýna `Staðfest með Facebook` fyrir sendanda
     þegar innskráður viðtakandi hefur raunverulegt samhengi við boðið.
   - Þetta má ekki opna aðgang að öðrum prófílum eða lánum.
   - Ef opnanleg Facebook prófílslóð fæst ekki örugglega úr provider-gögnum, ekki
     sýna `Skoða Facebook` í v1.

5. Aftenging
   - Skoða Supabase `unlinkIdentity` takmarkanir.
   - Ef notandi hefur aðeins OTP/email og Facebook sem identity, staðfesta að
     aftenging sé örugg og leyfð.
   - Ef aftenging er ekki leyfð af Supabase þegar aðeins ein identity væri eftir,
     sýna skýr skilaboð og ekki búa til eigin bypass.

## Files sem Claude Code þarf líklega að skoða

Read-only fyrst:

- `app/**/stillingar/minn-profill/**`
- `messages/is.json`
- `messages/en.json`
- `lib/**/supabase*`
- `lib/auth/**`
- `middleware.ts`
- núverandi auth callback routes undir `app/`
- loan invitation/detail components og server actions
- `sql/` aðeins til að skilja núverandi profile/auth schema, ekki til að skrifa
  migration nema Stebbi samþykki síðar

Claude Code skal nota `rg` til að finna nákvæmar slóðir og component nöfn.

## Design.md viðmið

Codex las viðeigandi kafla í `Design.md` áður en þetta plan var skrifað.

Mikilvæg viðmið fyrir implementation:

- Mobile app-upplifun gildir líka um auth og prófíl.
- Input/select/textarea texti þarf að vera minnst 16 px á mobile.
- Controls mega ekki valda horizontal overflow eða rangri scroll-stöðu eftir
  keyboard/focus.
- Buttons þurfa stöðugan loading state sem breytir ekki breidd.
- Route/client navigation sem bíður eftir auth/OAuth/callback þarf sýnilegt
  pending eða loader state.
- Textar eiga heima í `messages/is.json` og `messages/en.json`.

## Security og privacy áhætta

Þetta snertir auth, third-party identity, secrets og persónugögn.

Ekki gera:

- Ekki geyma Facebook secret, app ID eða access token í client-readable kóða eða
  public payload.
- Ekki logga provider metadata, tokens, netföng eða callback errors með
  persónugreinanlegum upplýsingum.
- Ekki gera Facebook-staðfestingu að access control.
- Ekki sýna Facebook-staðfestingu eða Facebook-gögn fyrir unrelated notendur.
- Ekki búa til global Facebook user search í v1.
- Ekki veikja RLS, grants, auth guards eða loan access.
- Ekki keyra eða skrifa SQL án sérstaks samþykkis Stebba.
- Ekki breyta Supabase Dashboard, Facebook App, secrets eða redirect URLs án
  sérstaks samþykkis Stebba.

Sérstök óvissa:

- `linkIdentity` er merkt beta í Supabase docs.
- Facebook/Supabase gætu ekki skilað opnanlegri prófílslóð.
- Supabase `unlinkIdentity` hefur identity-count takmarkanir.
- Facebook development mode og app review geta takmarkað hver getur prófað.

## Prófanir sem ættu að fylgja implementation

Automated þar sem hægt er:

- Profile component/state rendering fyrir disconnected/connected/error states.
- Server helper sem býr til minimal visible Facebook projection.
- Access tests ef loan invitation/detail payload fær ný Facebook fields.
- Regression tests fyrir OTP/login/session guards.

Manual:

- Tengja Facebook sem innskráður notandi.
- Hætta við OAuth consent.
- Prófa invalid/expired callback.
- Aftengja Facebook.
- Staðfesta að Facebook-login sé ekki komið á login síðu.
- Staðfesta að óviðkomandi notandi sér ekki Facebook state.
- Staðfesta að pending invitation recipient sér aðeins traustmerki sendanda í
  eigin boði.

## Localhost checks for Stebbi

Þetta er fyrir eftir implementation, ekki fyrir núverandi plan-skrá.

Stebbi ætti að prófa á localhost:

1. Opna `/stillingar/minn-profill` sem innskráður notandi.
2. Staðfesta að Facebook row birtist með stöðunni `Facebook ekki tengt`.
3. Smella `Tengja Facebook`.
4. Ef local OAuth provider er ekki stilltur, á UI að sýna skýra villu eða
   öruggt fallback, ekki hvítan skjá eða dauðan takka.
5. Þegar test provider/stillingar eru tilbúnar, klára OAuth sem Facebook test
   user og lenda aftur á prófíl með `Staðfest með Facebook`.
6. Enduropna prófíl eftir refresh og staðfesta að staðan haldist.
7. Opna lánaboð frá þessum sendanda sem annar test-notandi og staðfesta að
   traustmerki birtist aðeins þar sem boðið gefur aðgangssamhengi.
8. Prófa `Kannast ekki við þetta` / `Þekki málið` regression ef Facebook-merki
   birtist í sama UI.
9. Prófa mobile breiddir 360, 390 og 460 px. Passa sérstaklega að profile row,
   OAuth pending state, villur og lánaboð valdi ekki zoomi, overlap eða
   horizontal overflow.

Ekki prófa kæruleysislega:

- Ekki virkja production Facebook provider eða breyta production redirect URLs
  án sérstaks samþykkis.
- Ekki nota raunverulega notendur eða viðkvæm Facebook account gögn í prófunum
  nema Stebbi samþykki það.
- Ekki prófa með production Supabase secrets í local debug output.

## Tillaga að næsta skrefi

Claude Code geri Phase 0 read-only kortlagningu og skili handoff til Codex með
svari við ákvörðunarpunktunum áður en nokkur kóði, migration eða ytri stilling
er framkvæmd.

## Óvissa / þarf að staðfesta

- Hvort Supabase manual identity linking er virkt eða þarf provider/security
  config breytingu.
- Hvort Facebook identity metadata inniheldur opnanlega prófílslóð.
- Hvort lágmarks v1 þarf SQL projection eða getur notað núverandi profile/auth
  gögn örugglega.
- Hvernig aftenging á að virka ef Supabase leyfir ekki að fjarlægja síðustu eða
  næstsíðustu identity í tilteknu auth-state.
