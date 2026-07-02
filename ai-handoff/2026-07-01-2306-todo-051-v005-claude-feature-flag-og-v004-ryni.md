# TODO #51 - Claude Code v005 - Rýni á v004 og feature flag greining

Created: 2026-07-01 23:06
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Review + greining til Stebba og Codex
Refs:
- ai-handoff/2026-07-01-2208-todo-051-v002-codex-facebook-oauth-plan.md
- ai-handoff/2026-07-01-2216-todo-051-v003-claude-review-facebook-oauth-plan.md
- ai-handoff/2026-07-01-2225-todo-051-v004-codex-review-claude-facebook-oauth.md

Engin framkvæmd hefur átt sér stað.

---

## Rýni á Codex v004

v004 er rétt og vel unnið. Helsta leiðrétting - að rauðu fánarnir í v003 eigi
að verða spurningar í Phase 0 handoff frekar en blockers - er samþykkt.

Phase 0 verkefnalisti í v004 er skýr, afmarkaður og raunhæfur. Spurningarnar
sem Phase 0 á að svara eru réttar.

Eitt viðbótaratriði sem v004 nefnir ekki sérstaklega: feature flag. Sjá kafla
hér að neðan.

---

## Feature flag greining

Stebbi spurði hvort hægt væri að setja Facebook-tenginguna undir feature flag
til að lágmarka app review töf og áhættu fyrir aðra notendur.

### Stuttur svar

Feature flag er góð hugmynd og á að vera hluti af implementation. Hún verndar
aðra notendur við launch og gefur stjórn á rollout. Hún flýtir þó ekki Meta App
Review og úthýsir henni ekki.

### Tvær aðskildar hindranir

Facebook OAuth hefur tvær hindranir sem starfa óháð hvort annarri:

**1. Meta/Facebook hindrun - development mode**

Þegar Facebook OAuth app er í development mode (sem það er sjálfkrafa þegar nýtt
app er stofnað), getur aðeins þróunarlið og skráðir test users klárað OAuth
flowið. Þetta er Meta sem framfylgir þessu - óháð hvað UI sýnir. Feature flag
á ykkar enda breytir þessu ekki.

**2. Þín hindrun - feature flag**

Eftir að Meta App Review er samþykkt og appið fer í live mode, geta allir
Facebook-notendur klárað OAuth flowið. Á þeim tímapunkti er feature flag á
ykkar enda gagnlegur til að:
- Opna smám saman fyrir raunverulega notendur
- Takmarka blast radius ef eitthvað brotnar eftir launch
- Gefa Stebba stjórn á hvenær fleiri notendur fá aðgang

### Samanburður á stigum

| Stig | Meta takmarkar | Þið takmarkið | Hverjir geta notað |
|---|---|---|---|
| Development mode, engin flag | Já | Nei | Facebook test users |
| Development mode, með flag | Já | Já | Facebook test users á flag |
| Live mode, með flag | Nei | Já | Notendur á flag |
| Live mode, engin flag | Nei | Nei | Allir |

Development mode á Facebook er í raun hliðstætt feature flag á Meta-enda, bara
þröngara. Það þarf bæði live mode og feature flag til að ná fullum gæðum rollout.

### Hvað feature flag leysir ekki

- Flýtir ekki Meta App Review
- Leyfir ekki fleiri Facebook-notendum að klára OAuth á meðan í development mode
- Kemur ekki í stað Facebook test user-uppsetningar á prófunatíma

### Hvað feature flag leysir

- Verndar notendur sem eru ekki á flag frá UI breytingum (sjá ekkert)
- Verndar notendur sem eru ekki á flag frá mögulegum OAuth villum
- Gefur þér phased rollout eftir Meta App Review er lokið
- Gerir það auðveldara að slökkva á feature-inum hratt ef villa kemur upp

### Mælt: feature flag í v1

Feature flag á að vera hluti af implementation frá upphafi. Þetta er einfaldur
viðbótarskipulagningur sem gefur mikla stjórn. Phase 0 kortlagning á að skrá
hvort Teskeið hefur núverandi feature flag mynstur sem má endurnýta, eða hvort
einföld boolean umhverfisbreyta / Supabase config duga.

---

## Samantekt á opnum spurningum fyrir Phase 0

Þessar spurningar eru óbreyttar frá v004, nú með feature flag bætt við:

1. Hvaða núverandi auth/callback/profile mynstur eru í repo?
2. Er `linkIdentity` raunhæft og hvað þarf að virkja utan repo?
3. Hvaða exact Supabase og Facebook Developer stillingar þarf Stebbi síðar?
4. Fæst bara boolean verified state eða líka display name/avatar/profile URL?
5. Þarf SQL migration fyrir minimal projection? Ef já, hvaða RLS/grants?
6. Hvernig birtist badge örugglega í lánaboði án gagnaleka?
7. Hvernig virkar aftenging?
8. Er til núverandi feature flag mynstur í Teskeið sem má endurnýta?
9. Hvaða tests og localhost checks verða nauðsynleg eftir implementation?

---

## Tillaga að næsta skrefi

Phase 0 read-only kortlagning er tilbúin að hefjast ef Stebbi gefur skýrt
framkvæmdarleyfi.

Phase 0 felur aðeins í sér lestur skráa og docs. Engin kóðabreyting, SQL,
migration, Supabase-breyting, Facebook Developer breyting, commit, push eða
deploy.

---

## Óvissa / þarf að staðfesta

- Hvort Teskeið hefur feature flag mynstur sem má endurnýta: okunnur
- Hvort Supabase manual identity linking er virkt: okunnur
- Hvort `linkIdentity` beta-staða er ásættanleg eftir Phase 0: okunnur
- Hvort Facebook identity metadata inniheldur nokkuð sem má birta öðrum: okunnur
- Hvort v1 þarf SQL projection eða getur birt verified state án nýs schema: okunnur
