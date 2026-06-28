# Codex-rýni á Claude Code v005: Tengsl tilbúin til næsta áfanga?

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2145-todo-049-050-v005-claude-tengsl-review.md`

**Staða:** Meginstefnan er orðin góð, en Codex myndi ekki enn samþykkja
SQL-keyrslu. Claude Code má skrifa SQL- og kóðabreytingar næst, en Stebbi og
Codex þurfa að rýna raunverulegu SQL-skrárnar áður en nokkuð er keyrt.

## Findings

1. **Hátt: Handoffið vantar skyldukaflann `Localhost checks for Stebbi`.**

   `ai-handoff/README.md` segir að öll implementation plan, handoff og review
   skjöl eigi að innihalda `Localhost checks for Stebbi`. Claude Code v005
   vantar þann kafla. Þetta er ekki schema-galli, en þetta er vinnulagsgalli sem
   þarf að laga í næsta handoff.

2. **Hátt: Ekki má túlka þetta sem samþykki til að keyra SQL.**

   Claude Code skrifar að Claude Code sé tilbúinn til að skrifa `sql/53_*.sql`
   og `sql/54_*.sql` og fara í gang þegar Stebbi gefur SQL-keyrsluleyfi. Codex
   leggur áherslu á rétta röð:

   - Fyrst skrifar Claude Code SQL-skrárnar.
   - Síðan rýnir Codex raunverulegt SQL.
   - Síðan samþykkir Stebbi sérstaklega hvort SQL megi keyra.

   Plan-rýni er ekki sama og SQL-rýni. Þetta skiptir máli vegna Supabase,
   RLS, grants og production gagna.

3. **Miðlungs: Admin feature-access breytingin þarf nákvæma útfærslu og próf.**

   Hugmyndin um `?feature=` query param er góð, en núverandi `GET` route tekur
   engin request-argument. Claude Code þarf að breyta `GET()` í
   `GET(request: NextRequest)` eða sambærilegt. Admin component þarf líka að
   senda feature-param í öllum köllum:

   - initial `GET`
   - refresh eftir `POST`
   - `POST`
   - `DELETE`

   Default `umonnun` hegðun má vera áfram til bakábaksamhæfis, en ný
   `FeatureAccessSection` þarf að einangra state milli `umonnun` og `tengsl`.

4. **Miðlungs: `relationship_tags` þarf database-level validation.**

   Claude Code staðfestir canonical tag-strengi, en schema-plan sýnir ekki
   constraint á `relationship_tags.tag`. Í v1 ætti að vera check, t.d.:

   ```sql
   CHECK (tag IN ('unclassified', 'family', 'friends', 'recipients'))
   ```

   eða a.m.k. non-empty + max-length ef Claude Code vill leyfa extensible tags.
   Þar sem tags eru product-stýrð í v1 er strangt `IN (...)` betra.

5. **Miðlungs: Pages og actions þurfa defense-in-depth guard, ekki bara middleware.**

   Middleware má stoppa `TENGSL_ENABLED !== 'true'` hratt, en per-user
   `TENGSL_FLAG` check á að vera í server-side guard. Claude Code þarf að tryggja
   að:

   - `/stillingar/tengsl/page.tsx`
   - `/stillingar/tengsl/[id]/page.tsx`
   - allar relationship server actions
   - auto-vistun úr `createLoan` og `addLoanInvitation`

   kalli guard sem notar `guardTeskeidSession` og `checkFeatureAccess(...,
   'tengsl')`. Annars getur UI verið lokað en action enn skrifað gögn.

6. **Lágt: Endurtaka má minna í `checkFeatureAccess`, en það er ekki blocker.**

   Claude Code leggur til að afrita `umonnun` greinina fyrir `tengsl`. Það er í
   lagi fyrir hraða v1, en betra væri lítið helper-fall fyrir per-user
   feature-access til að forðast ósamræmi í logs, canonical email og error
   hegðun. Þetta er ekki blocker ef próf ná báðum feature-lyklum.

7. **Lágt: Bæta þarf static SQL regression-prófum.**

   Verkefnið hefur nú þegar SQL static tests. Bæta ætti við prófum sem staðfesta:

   - `sql/53_feature_access_tengsl.sql` leyfir bæði `umonnun` og `tengsl`
   - `sql/54_relationships.sql` notar ekki `contacts`
   - partial unique indexar eru notaðir, ekki `UNIQUE NULLS NOT DISTINCT`
   - `anon` og `authenticated` fá ekki grants
   - RLS er enabled á öllum relationship-töflum
   - `relationship_tags.tag` er validated

## Ákvörðun Codex

Codex er sammála að Claude Code megi fara í næsta **skrif- og útfærsluáfanga**:

- skrifa `sql/53_feature_access_tengsl.sql`
- skrifa `sql/54_relationships.sql`
- útfæra feature-access generaliseringu
- útfæra `tengsl` guard
- útfæra lágmarks relationship server helpers/actions

En Codex mælir gegn því að SQL sé keyrt fyrr en raunveruleg SQL-skjöl hafa
verið rýnd sérstaklega.

## Localhost checks for Stebbi

Þegar Claude Code hefur útfært næsta áfanga ætti Stebbi að prófa:

1. **Admin aðgangsstýring fyrir Umönnun helst óbreytt**
   - Opna `/admin`.
   - Bæta við og fjarlægja netfang undir Umönnun-aðgangi.
   - Vænt niðurstaða: núverandi Umönnun flæði virkar eins og áður.

2. **Admin aðgangsstýring fyrir Tengsl**
   - Bæta við netfangi undir Tengsl-aðgangi.
   - Fjarlægja sama netfang.
   - Vænt niðurstaða: réttur feature key er `tengsl`, ekki `umonnun`.

3. **Per-user gating**
   - Setja `TENGSL_ENABLED=true` og `TENGSL_FLAG=true`.
   - Prófa innskráðan notanda sem er í `feature_access`.
   - Prófa annan innskráðan notanda sem er ekki í `feature_access`.
   - Vænt niðurstaða: aðeins leyfði notandinn kemst inn á `/stillingar/tengsl`.

4. **Global off**
   - Setja `TENGSL_ENABLED=false`.
   - Opna `/stillingar/tengsl` sem annars leyfður notandi.
   - Vænt niðurstaða: feature lokast alveg og engin relationship gögn eru sótt.

5. **Óinnskráður aðgangur**
   - Opna `/stillingar/tengsl` logged-out.
   - Vænt niðurstaða: redirect á `/innskraning`, ekki `/login`.

6. **Auto-vistun úr lánum**
   - Stofna lán með viðtakandanetfangi.
   - Stofna annað lán án viðtakanda og bæta við netfangi síðar.
   - Vænt niðurstaða: bæði flæði búa til eða uppfæra Tengsl án tvítekningar.

7. **Privacy**
   - Skrá inn annan notanda.
   - Vænt niðurstaða: hann sér ekki relationship, tags, source, note eða
     private display name fyrri notanda.

Ekki keyra SQL á production, breyta Supabase Auth/provider stillingum, setja
secrets eða breyta feature_access í lifandi gagnagrunni nema Stebbi samþykki það
sérstaklega.
