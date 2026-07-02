# TODO #51 - Claude Code v003 - Rýni á Facebook OAuth plan

Created: 2026-07-01 22:16
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Review handoff til Stebba og Codex
Ref: ai-handoff/2026-07-01-2208-todo-051-v002-codex-facebook-oauth-plan.md

Þetta er rýni á v002 plan. Engin framkvæmd hefur átt sér stað.

---

## Yfirlit

Planið er vel skipulagt: scope er skýr, Phase 0 kemur á undan allri implementation,
og oryggi er meðhugsa. En þrjár rauðar fánur þurfa svar frá Stebba eða Codex
áður en Phase 0 er ræst.

---

## Rauðar fánur

### 1. `linkIdentity` er beta - stærsta tæknilega áhættan

Supabase merkir manual identity linking sem beta í docs. Beta APIs geta brotið í
point releases án fyrirvara og án migration path. Planið nefnir þetta en meðhöndlar
það sem "extra rýni" frekar en raunverulega áhættu.

Spurning til Stebba/Codex: Er beta-staðan talin ásættanleg áhætta? Ef Supabase
breytir hegðun eftir deploy, er fallback plan til?

### 2. Facebook app review - tímalínuáhætta sem planið vanrækir

Facebook krefst formlegar app review áður en production-notendur (utan skráðra
test users) geta notað OAuth. App review tekur venjulega 1-4 vikur og getur verið
hafnað. Þetta er ekki tæknileg hindrun heldur process-hindrun sem getur þýtt að
v1 sé tæknilega klárt en blocked í production í langan tíma.

Planið nefnir development mode takmarkanir en leggur ekki mat á tímalínu eða
hvata til að hefja Facebook app review sem samhliða skref.

Spurning til Stebba: Er þetta þekkt? Á Facebook app review að byrja samhliða
Phase 0?

### 3. Facebook prófílslóð - líklega ekki fáanleg

Meta hefur takmarkað aðgang að prófílslóðum verulega. `linkIdentity` skilar
Supabase identity metadata sem inniheldur yfirleitt `sub` (provider user ID) og
mögulega nafn/email. Opnanleg `facebook.com/profile` URL er nánast aldrei í
OAuth callback í dag.

Ef `Skoða Facebook` er einhvers staðar á vörslulistanum í v1, er mjög líklegt
að hún falli brott í Phase 0. Planið ratar rétt í að merkja þetta sem óvissu
en Codex og Stebbi ættu að vera tilbúnir að hún sé ekki fáanleg.

---

## Meðalstórar athugasemdir

### 4. `manual_linking_enabled` þarf sérstakar Supabase Auth stillingar

Supabase krefst að `manual_linking_enabled: true` sé sett í Auth config á
Dashboard. Þetta er Stebbi-verk, ekki kóðaverk. Phase 0 á sérstaklega að
staðfesta hvort þetta er virkt eða hvort það þarf breytingu.

### 5. Complexity vs. value hlutfall í v1

V1 markmið er eitt boolean traustmerki (`Staðfest með Facebook`) í lánaboð UI.
Til að ná þangað þarf:

- Facebook Developer App stofnun og stillingar
- Supabase provider config (Stebbi-verk)
- `linkIdentity` OAuth flow
- Callback handling
- Profile UI section á `/stillingar/minn-profill`
- Mögulega schema migration

Þetta er verulegt starf fyrir eitt badge. Planið tekur ekki afstöðu til hvort
þetta sé bestu nýting af tíma miðað við aðrar v1 forgangsraðanir. Codex er
best til þess að meta þetta.

### 6. Aftenging edge case er ósvara

Planið nefnir `unlinkIdentity` takmarkanir en svarar ekki hvað gerist ef notandi
hefur aðeins OTP/email og Facebook, þ.e. tvær identities en engin password-based
login. Supabase telur OTP sem identity. Phase 0 handoff þarf að svara þessu
skýrar, sérstaklega hvort UI á að sýna "Aftengja" yfirleitt í slíkum tilfellum.

---

## Það sem er gott í planinu

- Scope er skýr: tenging/staðfesting, ekki login
- Phase 0 read-only fyrst er rétt nálgun og verndar production
- Öryggi er vel hugsa: ekki geyma tokens, ekki nota sem access control, ekki
  birta raw metadata
- Design.md viðmið eru með og mobile-first er nefnt
- Test plan er raunhæfur og nær yfir edge cases

---

## Spurningar til Stebba og Codex

Fyrir Phase 0 hefst, er gott að fá svör við:

1. Er `linkIdentity` beta-staðan ásættanleg, eða á Codex að kanna hvort til sé
   stöðugur alternativ OAuth flow?

2. Er Facebook app review þekkt sem process-skref? Á að hefja hana samhliða
   Phase 0 til að missa ekki tíma?

3. Ef prófílslóð fæst ekki úr Facebook metadata (mjög líklegt), er boolean
   badge eitt og sér nóg til að réttlæta scope þessa verkefnis í v1?

4. Er `manual_linking_enabled` nú þegar virkt í Supabase Dashboard fyrir þetta
   project, eða þarf Stebbi að virkja það?

---

## Tillaga að næsta skrefi

Ef Stebbi og Codex eru ánægð með planið að teknu tilliti til þessara punkta,
getur Claude Code ræst Phase 0 read-only kortlagningu. Phase 0 felur aðeins
í sér lestur skráa og skilar handoff til Codex - engin kóðabreyting, SQL,
commit, push eða Supabase-breyting.

Framkvæmdarleyfi þarf sérstaklega frá Stebba áður en Phase 0 hefst.

---

## Óvissa / þarf að staðfesta

- Confidence: medium - rýni byggir á v002 skjali, ekki á lestur á kóðagrunni
- `manual_linking_enabled` staða í þessum Supabase project: okunnur
- Facebook metadata sem Supabase skilar í raun fyrir þetta project: okunnur
- App review tímalína og hvort Facebook app er til: okunnur
