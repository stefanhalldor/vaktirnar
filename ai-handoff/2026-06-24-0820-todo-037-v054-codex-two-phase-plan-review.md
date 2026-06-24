# #37 v054 - Codex-rýni á Claude v053 tveggja fasa plan

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Codex

**Rýnt skjal:** `ai-handoff/2026-06-24-0814-todo-037-v053-claude-olesid-two-phase-plan.md`

**Niðurstaða:** Fasi 1 er samþykktur með litlum lagfæringum. Fasi 2 er rétta áttin, en SQL helperinn eins og hann er skrifaður í v053 er ekki nógu öruggur eða nákvæmur til framkvæmdar. Sérstaklega má hann ekki skila handahófskenndum einum user þegar fleiri en einn `auth.users.email` canonical-matchar sama Gmail/Googlemail netfang.

## Findings

### High - SQL helper má ekki nota `LIMIT 1` án ákvörðunar um canonical duplicate notendur

V053 leggur til:

```sql
SELECT id
FROM auth.users
WHERE public.normalize_email_canonical(email)
    = public.normalize_email_canonical(p_email)
LIMIT 1;
```

Þetta leysir dotted Gmail lookup aðeins ef nákvæmlega einn auth user canonical-matchar netfangið. En Supabase getur mögulega haft fleiri en einn user með netföng sem canonical-matcha sama Gmail inbox, til dæmis `a.b@gmail.com` og `ab@gmail.com`.

Þá verður `LIMIT 1`:

- óákveðið án `ORDER BY`;
- mögulega rangt fyrir notandann sem raunverulega notar appið;
- ekki í samræmi við `get_my_loans`, þar sem pending invitation row birtist fyrir hvern authenticated user sem canonical-matchar recipient email.

Claude Code þarf að endurplana Fasa 2 áður en SQL er skrifað.

Codex telur öruggari valkosti vera:

1. SQL helper skili `SETOF uuid` eða `TABLE(user_id uuid)` fyrir alla canonical-matching users, og appið skrái event fyrir alla þá user IDs, með sama `eventKey`.
2. Eða SQL helper skili einu user id aðeins ef nákvæmlega einn match er til, en skili `NULL`/status ef canonical duplicate er til. Þá þarf sér product ákvörðun um duplicate tilfelli.

Miðað við núverandi vöruhegðun er valkostur 1 líklega eðlilegri: ef canonical email-reglan gerir mörgum auth accounts kleift að sjá/claim-a sama pending boð, þá þurfa þau líka að fá sama `Ólesið` event.

### High - Fasi 2 þarf explicit samþykki áður en SQL er keyrt

V053 segir að Fasi 2 þurfi samþykki Stebba á SQL migration. Það er rétt, en handoffið þarf líka að segja nákvæmlega:

- SQL má skrifa í repo sem migration-plan;
- SQL má ekki keyra á Supabase fyrr en Stebbi samþykkir það sérstaklega;
- hvort deploy þarf að bíða eftir SQL eða hvort appið þarf að feature-detecta helperinn;
- hvort PostgREST/Supabase schema cache reload þarf eftir nýja RPC/function.

Athugasemd: v053 segir að PostgREST þurfi ekki reload þar sem RPC er kallað úr service-role TypeScript. `admin.rpc(...)` fer samt venjulega í gegnum PostgREST/Supabase API. Bæta þarf schema-cache reload eða staðfestingu á að það sé ekki nauðsynlegt.

### Medium - Fasi 1 timestamp gæti birt `07:40` í stað `7:40`

Stebbi valdi hástaf og dæmið hans er:

`Miðvikudagurinn 24. júní kl. 7:40`

V053 leggur til `hour: '2-digit'`, sem gæti skilað `07:40`. Það passar ekki við dæmið.

Claude Code þarf að:

- nota `hour: 'numeric'` eða fjarlægja leading zero úr klukkutímanum;
- prófa nákvæmlega `Miðvikudaginn 24. júní kl. 7:40` eða það orðalag sem er valið;
- halda hástaf í byrjun.

Athuga líka orðalagið: Stebbi skrifaði `Miðvikudagurinn`, en núverandi messages/weekdays virðast vera í þolfalli, t.d. `miðvikudaginn`. Ef við notum núverandi `weekdays` verður náttúrulega útkoman `Miðvikudaginn 24. júní kl. 7:40`. Codex telur það málfræðilega betra í þessari setningu, en ef Stebbi vill nákvæmlega `Miðvikudagurinn` þarf nýjan messages-lykil eða sérstakt form.

### Medium - Fasi 1 má framkvæma, en `viewHref` breyting þarf að passa query params

`from=heim` er samþykkt fyrir detail links úr `Ólesið`.

Claude Code þarf að passa að query params verði ekki rangt samsett:

- detail href: `/auth-mvp/lanad-og-skilad/<loan_id>?from=heim`
- fallback invitation href, ef hann er snertur: `/auth-mvp/lanad-og-skilad?invitation=<id>&from=heim`

Ekki búa til slóð á borð við:

`/auth-mvp/lanad-og-skilad?invitation=<id>?from=heim`

Nota helst `URLSearchParams` eða lítið helper-fall til að setja query params.

### Medium - Fasi 2 þarf próf fyrir duplicate canonical matches

Prófalistinn í v053 inniheldur venjulegt netfang, dotted Gmail, Googlemail og notandi finnst ekki. Það vantar duplicate canonical case.

Bæta þarf prófi fyrir:

- tveir auth users canonical-matcha sama Gmail netfang;
- helper/app hegðun er deterministic og samþykkt;
- ef helper skilar mörgum IDs eru events skráð fyrir alla viðeigandi user IDs;
- enginn óviðkomandi user fær event.

### Low - SQL function ætti að fá nákvæmara nafn ef hún skilar mörgum

Ef Fasi 2 fer í `SETOF uuid`, nafnið `lookup_user_id_by_canonical_email` er villandi. Betra:

- `lookup_user_ids_by_canonical_email`
- eða `get_user_ids_by_canonical_email`

## Samþykkt scope

### Fasi 1 má framkvæma núna

Codex samþykkir Fasa 1 án SQL:

1. Nákvæmari `Ólesið` labels:
   - `Breytt nafn`
   - `Breytt athugasemd`
   - `Breyttur skiladagur`
   - `Breytt lánsdagsetning`
   - fallback `Breytt` fyrir blandaðar breytingar.
2. `from=heim` back-navigation frá `Ólesið` detail links.
3. Timestamp undir event label með hástaf og án leading zero í klukkutíma.

### Fasi 2 þarf revised plan áður en framkvæmd hefst

Codex samþykkir ekki Fasa 2 SQL eins og hann stendur í v053.

Claude Code skal skila stuttu v055 revised Fasi 2 plani sem svarar:

1. Skilar helper einn user id, mörgum user ids, eða status um duplicate?
2. Ef einn: hvernig er forðast handahófskennt `LIMIT 1`?
3. Ef margir: hvernig skráir appið events fyrir alla og hvernig eru duplicate/actor cases meðhöndluð?
4. Þarf PostgREST/Supabase schema cache reload?
5. Hvernig verður migration rollback/recovery orðað?
6. Hvaða próf staðfesta duplicate canonical match?

## Prófanir sem Codex vill sjá

### Fasi 1

Keyra:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx`

Staðfesta með prófum:

- `loan_updated` með einu `item_name` change birtir `Breytt nafn`.
- `loan_updated` með einu `note` change birtir `Breytt athugasemd`.
- `loan_updated` með einu `due_at` change birtir `Breyttur skiladagur`.
- `loan_updated` með einu `loaned_at` change birtir `Breytt lánsdagsetning`.
- blandaðar breytingar falla áfram í almennt `Breytt`.
- timestamp label birtist með hástaf og án leading zero: `Miðvikudaginn 24. júní kl. 7:40`.
- `?from=heim` detail-link skilar back-link á `/auth-mvp/heim`.
- detail opnað beint úr lánalista skilar back-link áfram á `/auth-mvp/lanad-og-skilad`.
- recipient email birtist ekki í label eða drawer.

### Fasi 2

Ekki keyra SQL fyrr en Stebbi samþykkir.

Þegar Fasi 2 fær revised plan þarf próf að staðfesta:

- venjulegt netfang fær event;
- dotted Gmail fær event;
- Googlemail fær event;
- canonical duplicate hegðun er deterministic og samþykkt;
- notandi finnst ekki: engin throw og actor event skráist áfram;
- actor event er `initiallyRead: true`;
- recipient event er ekki `initiallyRead`;
- email lekur ekki í logs, UI eða client payload.

## Localhost checks for Stebbi

### Eftir Fasa 1

1. `/auth-mvp/heim` sem innskráður notandi.
2. Staðfesta að timestamp birtist undir event heiti með hástaf, t.d. `Miðvikudaginn 24. júní kl. 7:40`, og án lárétts overflow á 360-460 px.
3. Breyta nafni á hlut. Mótaðili á að sjá `Breytt nafn: ...` í `Ólesið`.
4. Breyta athugasemd. Mótaðili á að sjá `Breytt athugasemd: ...`.
5. Smella á event í `Ólesið` → `Skoða` → `Til baka`. Notandi á að enda á `/auth-mvp/heim`.
6. Opna detail beint úr lánalista → `Til baka`. Notandi á að enda á `/auth-mvp/lanad-og-skilad`.
7. Regression: `loan_returned`, `loan_invitation_received` og önnur labels breytast ekki.
8. Regression: recipient email sést hvergi í `Ólesið` eða console.

### Eftir Fasa 2, ef SQL verður samþykkt síðar

1. Breyta skiladegi á máli þar sem viðtakandi hefur ekki smellt `Þekki málið`.
2. Skrá inn sem viðtakandi og staðfesta event í `Ólesið`.
3. Endurtaka með Gmail-netfangi með punktum.
4. Ef hægt er að setja upp canonical duplicate test-state, staðfesta að samþykkt hegðun virki þar.

## Óvissa / þarf að staðfesta

- Codex keyrði ekki browser/manual localhost check.
- Fasi 1 er low-risk og má fara áfram.
- Fasi 2 er ekki tilbúinn til framkvæmdar fyrr en duplicate canonical match og schema-cache/rollout atriði eru leyst.
- Stebbi þarf að samþykkja SQL keyrslu sérstaklega síðar ef Fasi 2 fer í migration.
