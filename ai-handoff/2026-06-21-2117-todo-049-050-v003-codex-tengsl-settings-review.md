# Codex-rýni: #49 og #50 eftir Claude Code review

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2109-todo-049-050-v002-claude-tengsl-settings-review.md`

**Staða:** Codex samþykkir megináttina, en með skýrum mörkum áður en Claude
Code fer í framkvæmd.

## Findings

1. **Route-áhættan er raunveruleg, en lausnin á ekki að verða full #22 hreinsun.**
   Claude Code bendir réttilega á að núverandi kerfi er enn með
   `/auth-mvp/*` slóðir og að ný `/auth-mvp/stillingar/*` slóð þyrfti guard.
   Stebbi hefur samt ákveðið að nýja stillingasvæðið eigi að vera canonical:
   `/stillingar/tengsl` og `/stillingar/minn-profill`.

   Codex mælir með að Claude Code bæti við nýju stillingasvæði og skýrum
   middleware/session guard fyrir `/stillingar/*`, en taki ekki fulla #22
   hreinsun á `/auth-mvp/heim`, `/auth-mvp/lanad-og-skilad` og eldri
   prófíl-slóðum í sama diffi. Gamlar prófíl-slóðir mega vísa áfram á
   `/stillingar/minn-profill`, en það þarf að varðveita query params og forðast
   redirect-lykkjur.

2. **Feature flag er rétt ákvörðun og þarf að verja bæði route og actions.**
   `Tengsl` á að fara undir feature flag í byrjun. Ekki dugar að fela aðeins
   link í UI. Claude Code þarf að verja:

   - `/stillingar/tengsl`
   - `/stillingar/tengsl/[id]`
   - server actions/API sem lesa eða skrifa tengsl
   - sjálfvirka vistun tengsla úr `Lánað og skilað`

   Nafn flags má vera enskt í kóða, t.d. `RELATIONSHIPS_ENABLED` eða
   `TENGSL_ENABLED`. Ef notað er `feature_access` þarf feature-lykilinn líka að
   vera skýr og prófanlegur.

3. **Vistun tengsla þegar lánaboð er sent er góð product-regla, en ekki við
   innslátt.** Tengsl eiga ekki að verða til um leið og notandi skrifar netfang
   í form. Fyrsti öruggi punktur er þegar lánaboð er sent eða stofnað með gildu
   netfangi og appið hefur búið til raunverulegt invitation/loan samhengi.

   Claude Code þarf að meðhöndla typo, afturköllun og email-failure þannig að
   notandi geti síðar breytt, falið eða eytt ruglingslegu tengsli. Þetta tengist
   líka #43 Gmail-punktamálinu og email-normaliseringu.

4. **Töfluheiti eiga að vera á ensku.** Codex er sammála Stebba. Nota ensk
   snake_case heiti í SQL, t.d. `relationships`, `relationship_sources` og
   mögulega `relationship_tags`, eða `contacts` ef Claude Code rökstyður það
   betur við núverandi kóða. Íslensk hugtök eins og `Tengsl`, `Óflokkaður` og
   `Fjölskylda` eiga að vera UI-textar í `messages/is.json`, ekki schema-heiti.

5. **Ekki búa til almennan activity-index í v1.** Fyrsta útgáfa ætti að sýna
   tengsl, uppruna og lánatengda virkni með afmörkuðu read-through úr
   `Lánað og skilað`. Almenn þvert-á-öll-Teskeiðar activity-tafla er stærra
   verk og ætti að bíða þar til önnur Teskeið þarf sama mynstur.

6. **RLS og privacy eru hæsta áhættan.** Tengsl innihalda einkanafn,
   einkalýsingu, fjölskyldutengsl og síðar mögulega upplýsingar um börn. Claude
   Code má ekki opna broad `authenticated` read. Meginreglan þarf að vera:
   eigandi sér aðeins eigin tengsl, eigin tags, eigin einkalýsingu og eigin
   upprunasamhengi.

## Skýr stefna frá Stebba

- Nota einn stað fyrir fólk og fjölskyldu: `/stillingar/tengsl`.
- Setja `Minn prófíll` undir `/stillingar/minn-profill`, ekki standalone
  `/minn-profill`.
- Setja `Tengsl` undir feature flag til að byrja með.
- Vista tengsl þegar lánaboð er sent/stofnað með gildum viðtakanda.
- Nota ensk töflu- og dálkaheiti í SQL.

## Tillaga að framkvæmdarröð

1. Claude Code geri fyrst schema-plan, án SQL-keyrslu.
2. Schema-planið skilgreini ensk töfluheiti, RLS, grants, rollback og hvernig
   email-normalisering tengist #43.
3. Claude Code bæti síðan við `sql/53_*.sql`, en keyri það ekki fyrr en Stebbi
   samþykkir sérstaklega.
4. Claude Code útfæri feature flag og middleware guard fyrir `/stillingar/*`.
5. Claude Code útfæri `/stillingar/tengsl` og `/stillingar/tengsl/[id]`.
6. Claude Code færi prófíl canonical leiðina undir `/stillingar/minn-profill`
   með varfærnum redirects frá eldri prófíl-slóðum.
7. Claude Code tengi sjálfvirka vistun við lánaboðsflæðið eftir að invitation
   hefur verið stofnað, ekki við textainnslátt.

## Supabase og migration-varúð

Næsta SQL migration virðist vera `sql/53_*.sql` miðað við að `52_feature_access.sql`
er til staðar. Hún má ekki vera keyrð án sér samþykkis frá Stebba.

Migration þarf að taka fram:

- hvort hún breytir schema, gögnum eða hvoru tveggja
- RLS policies á öllum nýjum töflum
- grants, sérstaklega hvort client má lesa beint eða aðeins server actions
- hvort `service_role` functions eru notaðar
- rollback/recovery plan
- hvernig gögn tengjast auth users, email-normaliseringu og óinnskráðum tengslum

## Localhost checks for Stebbi

Þegar Claude Code hefur útfært fyrsta áfanga ætti Stebbi að prófa þetta á
localhost:

1. Með feature flag slökkt:
   - Opna `/stillingar/tengsl`.
   - Vænt niðurstaða: síða er ekki aðgengileg eða birtir skýrt óvirkt state.
   - Staðfesta að `Lánað og skilað`, `/heim` og innskráning virki áfram.

2. Með feature flag kveikt:
   - Innskráður notandi opnar `/stillingar/tengsl`.
   - Vænt niðurstaða: tengslalisti birtist án gagnaleka.

3. Óinnskráður notandi:
   - Opna `/stillingar/tengsl` og `/stillingar/minn-profill`.
   - Vænt niðurstaða: redirect fer í `/innskraning`, ekki legacy `/login`.

4. Lánaboð:
   - Stofna lán með viðtakandanetfangi.
   - Vænt niðurstaða: viðtakandi birtist í `/stillingar/tengsl` sem
     `Óflokkaður` með uppruna `Lánað og skilað`.

5. Privacy:
   - Skrá inn annan notanda.
   - Vænt niðurstaða: sá notandi sér ekki tengsl, einkanafn, einkalýsingu eða
     fjölskyldugögn fyrri notanda.

6. Prófíll:
   - Opna `/stillingar/minn-profill`.
   - Prófa eldri prófíl-slóð ef hún er enn til.
   - Vænt niðurstaða: notandi endar á einni canonical prófílsíðu og engin
     redirect-lykkja myndast.

Ekki prófa production-gögn, SQL-keyrslu, Supabase dashboard breytingar eða
feature-access breytingar á lifandi umhverfi nema Stebbi samþykki það
sérstaklega.
