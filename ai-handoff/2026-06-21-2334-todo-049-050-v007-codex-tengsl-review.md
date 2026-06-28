# Codex-rýni á Claude Code v006: grænt ljós til að skrifa, ekki keyra

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2151-todo-049-050-v006-claude-tengsl-review.md`

**Staða:** Codex samþykkir að Claude Code fari í næsta skrif- og
útfærsluáfanga. Þetta er ekki samþykki til að keyra SQL. Raunverulegar
`sql/53` og `sql/54` skrár þurfa sér rýni áður en þær eru keyrðar.

## Findings

1. **Hátt: `upsertLoanRelationship` má ekki bara athuga `TENGSL_ENABLED`.**

   Claude Code segir að `upsertLoanRelationship` athugi `TENGSL_ENABLED` áður en
   hann skrifar og sé no-op ef flag er slökkt. Þar sem Stebbi vill per-user
   gating í v1 þarf helperinn líka að virða `TENGSL_FLAG` og `feature_access`.

   Annars getur notandi sem má ekki sjá `/stillingar/tengsl` samt búið til
   relationship gögn með því að nota `Lánað og skilað`.

   **Krafa:** Auto-vistun úr `createLoan` og `addLoanInvitation` á aðeins að
   skrifa relationship ef `checkFeatureAccess(user.id, user.email, 'tengsl')`
   skilar `true`. Ef það skilar `false` á helperinn að vera no-op.

2. **Miðlungs: Source-lán þarf að sækja með aðgangssíu.**

   `relationship_sources.source_id` verður polymorphic UUID og ekki FK í v1.
   Það er í lagi, en þegar `/stillingar/tengsl/[id]` sýnir lánatengda virkni má
   server code ekki treysta source row einni og sér.

   **Krafa:** Þegar source-lán eru sótt þarf að staðfesta að innskráður eigandi
   relationship sé raunverulega þátttakandi eða creator í láninu. Service-role
   queries bypassa RLS, þannig að owner-sían þarf að vera í app/RPC lógík.

3. **Miðlungs: Admin feature-access generalisering þarf regression-próf fyrir default.**

   `?feature=` leiðin er góð. Þar sem núverandi API defaultar á `umonnun`, þarf
   próf sem staðfestir:

   - `/api/admin/feature-access` án query param notar áfram `umonnun`
   - `/api/admin/feature-access?feature=tengsl` notar `tengsl`
   - óþekktur feature key skilar 400 og skrifar ekkert
   - POST/DELETE nota sama feature key og GET

4. **Miðlungs: Middleware og page/action guards þurfa samræmda hegðun.**

   Middleware má loka `TENGSL_ENABLED !== 'true'` hratt. Per-user gating á að
   vera í server guard. Claude Code þarf að passa að:

   - óinnskráður á `/stillingar/tengsl` fari á `/innskraning`
   - innskráður án per-user aðgangs fari á `/`
   - relationship actions skili no-op/redirect/error án gagnaskrifa ef aðgangur
     vantar
   - `AUTH_MVP_ENABLED=false` loki líka stillingasvæðinu í gegnum
     `guardTeskeidSession` eða sambærilegt server-side guard

5. **Lágt: Bæta i18n við framkvæmdarröð.**

   Nýjar síður og admin textar mega ekki hardcode-a notendatexta í components ef
   hægt er að fylgja núverandi `messages/is.json` og `messages/en.json` mynstri.
   Þetta er ekki SQL-blocker, en ætti að vera í kóðarýni.

## Ákvörðun Codex

Claude Code má fara í framkvæmd með þessum skilyrðum:

- Skrifa SQL-skrár og kóða, en keyra ekki SQL.
- Virða per-user gating í öllum lestri og skrifum, líka auto-vistun úr lánum.
- Skila handoff eftir útfærslu með:
  - breyttum skrám
  - keyrðum skipunum og exit codes
  - staðfestingu á að SQL var ekki keyrt
  - `Localhost checks for Stebbi`
  - sérstökum Supabase/RLS/grants kafla fyrir `sql/53` og `sql/54`

## Localhost checks for Stebbi

Þegar Claude Code hefur skrifað breytingarnar og SQL hefur síðar verið keyrt
með sér samþykki Stebba, á Stebbi að prófa:

1. **Auto-vistun með leyfðum notanda**
   - `TENGSL_ENABLED=true`, `TENGSL_FLAG=true`.
   - Notandi er skráður í `feature_access` fyrir `tengsl`.
   - Stofna lán með viðtakanda.
   - Vænt: relationship verður til.

2. **Auto-vistun með óleyfðum notanda**
   - Sami env, en notandi er ekki í `feature_access`.
   - Stofna lán með viðtakanda.
   - Vænt: lán virkar, en relationship verður ekki til.

3. **Tengslasíða og source-lán**
   - Opna `/stillingar/tengsl/[id]`.
   - Smella á lánasource.
   - Vænt: aðeins lán sem eigandi relationship hefur aðgang að birtast eða opnast.

4. **Admin feature access**
   - Prófa Umönnun án query param.
   - Prófa Tengsl með `feature=tengsl`.
   - Vænt: hvor listi skrifar í réttan feature key.

5. **Óinnskráður og óleyfður aðgangur**
   - Logged-out á `/stillingar/tengsl` fer á `/innskraning`.
   - Innskráður án `tengsl` aðgangs fer á `/`.

Ekki keyra SQL á production eða breyta `feature_access` í lifandi gagnagrunni
nema Stebbi samþykki það sérstaklega eftir að raunverulegar SQL-skrár hafa verið
rýndar.
