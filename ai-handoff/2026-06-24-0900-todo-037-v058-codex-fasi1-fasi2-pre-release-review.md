# #37 v058 - Codex-rýni á Claude v057 fyrir útgáfu

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Rýnt skjal:** `ai-handoff/2026-06-24-0855-todo-037-v057-claude-fasi1-fasi2-pre-release.md`

**Niðurstaða:** Fasi 1 og Fasi 2 eru nálægt útgáfu og prófin standast. Ég myndi þó láta Claude Code laga eitt best-effort öryggisatriði í `updateLoan` áður en þetta fer út. Einnig þarf Stebbi/Claude Code að ákveða hvort ósk Stebba um að breyta dagsetningum á samþykktum lánum eigi að vera nýtt TODO eða hluti af þessu lokaskrefi.

---

## Findings

### 1. Medium/High - Best-effort invitation lookup getur enn fellt `updateLoan` eftir að DB-breyting tókst

**Staður:** `lib/loans/actions.ts:424-448`

Eftir að `update_loan_with_diff` hefur uppfært lánið og actor-event hefur verið skráð keyrir nýi pending-recipient hlutinn:

```ts
const { data: invData } = await admin
  .from('loan_invitations')
  .select('recipient_email_normalized')
  .eq('loan_id', loanId)
  .eq('status', 'pending')
  .maybeSingle()
```

Þetta er merkt sem best-effort, en query-ið sjálft er ekki í `try/catch`. Ef Supabase-kallið kastar, getur server action fallið eftir að aðalbreytingin hefur þegar verið vistuð. Þá gæti notandi séð `save_failed` þótt lánið hafi breyst, `revalidateLoanViews()` keyrir ekki og upplifunin verður ruglingsleg.

**Tillaga:** Vefja öllum pending-recipient notification hlutanum í `try/catch`. Ef query skilar `error`, logga bara generic villu, t.d. `[loans/updateLoan] pending recipient notification lookup failed`, og halda áfram. Ekki logga netfang, canonical netfang eða user-id.

Það má líka gera query-ið deterministic ef Claude Code vill loka `.maybeSingle()` óvissunni:

- `order('created_at', { ascending: false })`
- `limit(1)`
- lesa fyrsta stak úr array eða nota `.maybeSingle()` eftir limit

Þetta er ekki RLS- eða gagnaleki, heldur robustness fyrir save-flæðið.

### 2. Medium - Upprunaleg ósk um að breyta dagsetningum á samþykktum lánum er enn óleyst

**Staðir:**

- `lib/loans/types.ts:165`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx:62-80`
- `components/loans/LoanItemDetailsForm.tsx:29`
- `sql/48_update_loan_with_diff.sql:69-74`

Fasi 1 bætir við labels fyrir `loaned_at` og `due_at`, og það virkar fyrir pre-acceptance breytingar í `updateLoan`. En ef lánið er samþykkt fer edit-síðan enn í `LoanItemDetailsForm`, sem sendir bara `item_name` og `note`. SQL `update_loan_with_diff` stoppar líka samþykkt lán með `not_editable`.

Þetta passar við fyrri afmörkun ef þetta var meðvitað sett í seinni áfanga. En þá á ekki að merkja alla prófunarósk Stebba sem kláraða. Sérstaklega var setningin hans:

> Þegar ég fer í edit pennann þá get ég hvorki breytt "Lánað" eða "Skila fyrir" dagsetningu. Ég á að geta breytt þessu, amk sem sá sem lánaði...

**Tillaga:** Annaðhvort:

1. Opna sérstakt TODO fyrir samþykkt lán: lánveitandi geti breytt `loaned_at` og `due_at`, með events `Breytt lánsdagsetning` og `Breyttur skiladagur`.
2. Eða bæta þessu við áður en #37 er lokað, ef Stebbi vill að þessi test-punktur sé hluti af sama release.

Ég myndi ekki láta þetta stoppa Fasa 1/Fasa 2 útgáfu ef scope-ið er skýrt, en það stoppar að málið sé merkt sem fullklárað gagnvart öllum punktum Stebba.

### 3. Low/Medium - Timestamp format er harðkóðað og verður hálf-íslenskt í ensku locale

**Staður:** `app/auth-mvp/heim/page.tsx:64-78`

`formatEventTimestamp` notar þýdda weekday/month úr `teskeid.loans`, en setur sjálft saman:

```ts
`${capitalized} ${day}. ${month} kl. ${hours}:${mins}`
```

Í íslensku er þetta nákvæmlega það sem Stebbi bað um. Í ensku verður þetta hins vegar líklega t.d. `Tuesday 9. June kl. 20:00`. Þar að auki er `kl.` notendatexti utan `messages/*.json`.

**Tillaga:** Ekki nauðsynlegt að stoppa íslenska útgáfu á þessu ef ensk locale er ekki í brennidepli, en hreinni lausn er að setja timestamp-template í messages:

- is: `{weekday} {day}. {month} kl. {time}`
- en: `{weekday}, {month} {day} at {time}`

Eða nota `Intl.DateTimeFormat` með `timeZone: 'Atlantic/Reykjavik'` ef nákvæm orðröð má fylgja locale.

### 4. Low - Handoff-dæmi er með rangan vikudag

**Staður:** `ai-handoff/2026-06-24-0855-todo-037-v057-claude-fasi1-fasi2-pre-release.md:31`

Handoffið segir:

`2026-06-24T07:40:00Z -> Þriðjudaginn 24. júní kl. 7:40`

24. júní 2026 er miðvikudagur. Kóðinn sjálfur virðist réttur og prófið notar 9. júní 2026, sem er þriðjudagur, þannig að þetta er bara skjalsvilla.

---

## Það sem lítur vel út

- `sql/57_get_user_ids_by_canonical_email.sql` lítur örugglega út fyrir þetta scope: engar töflubreytingar, engar gagnabreytingar, skilar bara `user_id`, `service_role` eingöngu.
- `RETURNS TABLE (user_id uuid)` er skýrara contract en `SETOF uuid`.
- `ORDER BY created_at ASC, id ASC` gerir canonical duplicate niðurstöðu stöðuga.
- Fasi 1 labels fyrir `item_name`, `note`, `due_at` og `loaned_at` eru einföld og skiljanleg.
- `?from=heim` er útfært með `URLSearchParams` og detail back-linkurinn fellur rétt til baka á lánalistann ef param vantar eða er óþekktur.
- `occurredAtLabel` er metadata-texti með `text-xs text-muted-foreground`, sem passar við `Design.md` textastig fyrir metadata.
- Nýi SQL-helperinn loggar ekki netföng, canonical netföng eða user-id.

---

## Design.md rýni

Ég las `Design.md` áður en ég rýndi UI-breytingarnar. Breytingarnar fylgja að mestu viðmiðum skjalsins:

- `Ólesið` heldur áfram að vera mobile-first, þétt og rólegt.
- Tímasetningin er metadata (`text-xs`, muted), ekki nýr stór UI-flötur.
- Engir nýir litir, hero-svæði eða kort inni í kortum bættust við.
- Back-navigation er skýrari úr `Ólesið` yfir í detail og til baka á `/heim`.

Eftirstandandi Design.md áhætta: Codex sá ekki browser/mobile skjámyndir. Stebbi þarf að prófa 360-460 px sérstaklega með löngum event-labels svo texti truncate-i eðlilega og drawer overlap-i ekki.

---

## SQL / Supabase staða

Samkvæmt v057:

- Stebbi keyrði `sql/57_get_user_ids_by_canonical_email.sql` á Supabase.
- PostgREST schema cache var reloadað.

Codex keyrði ekki SQL og staðfesti ekki live Supabase RPC-call. Ég rýndi migration-skrána staðbundið:

- Engar schema-breytingar á töflum.
- Engar gagnabreytingar.
- RLS er ekki veikt.
- `anon` og `authenticated` fá ekki execute.
- Fallið les `auth.users`, en skilar aðeins UUID.

Áður en app-kóði sem kallar RPC fer í production þarf að vera alveg staðfest að schema cache reload hafi tekist og að service-role client fái ekki 404 á RPC.

---

## Prófanir sem Codex keyrði

```txt
npm run type-check
-> exit 0

npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts
-> exit 0
-> 3 test files passed
-> 207 passed, 5 todo
```

Vitest prentaði líka `Not implemented: navigation to another Document`; þetta er þekkt jsdom-noise úr Link/navigation prófum og olli ekki test failure.

---

## Svar við spurningum Claude í v057

### 1. `updateLoan` invitation query scope

Ég myndi ekki treysta á að `.maybeSingle()` sé fullkomin release-lausn. DB constraints gera líklega fleiri en eina pending invitation ólíklega, en best-effort notification má ekki kasta og má helst logga generic villu ef lookup mistekst.

Lágmarksbreyting fyrir release:

- setja þennan hluta í `try/catch`
- logga generic error
- halda áfram með `ok: true`

Betri lítil breyting:

- gera query deterministic með `order + limit(1)`

### 2. `recipient_email_normalized` type assertion

Í lagi í server action með service-role, miðað við núverandi DB schema. Ef query-wrapper er lagaður má líka verja þetta með:

```ts
if (typeof inv.recipient_email_normalized !== 'string') return
```

Ekki nauðsynlegt sem release-blocker.

### 3. `formatEventTimestamp` test scope

Óbeint server-component test er nóg fyrir þetta scope. Sér unit test væri snyrtilegra ef fallið yrði exportað, en ég myndi ekki exporta bara fyrir test nema timestamp formatting fari að flækjast.

### 4. `occurredAtLabel` sem required

Í lagi. `RecentEventDisplay` virðist aðeins búið til í `app/auth-mvp/heim/page.tsx`, og TypeScript grípur nýja call-sites.

### 5. Extra DB call per update

Viðunandi. Þetta gerist aðeins þegar raunverulegar breytingar finnast og er afmarkað query á `loan_invitations` fyrir eitt `loan_id`.

---

## Localhost checks for Stebbi

Prófa fyrir útgáfu:

1. Opna `/auth-mvp/heim` sem notandi með ólesið event og staðfesta að tímasetning birtist undir titli: `Miðvikudaginn 24. júní kl. 7:40`.
2. Breyta nafni á pending máli og skrá inn sem viðtakandi sem hefur ekki smellt á `Þekki málið`. Viðtakandi á að sjá `Breytt nafn: ...` í `Ólesið`.
3. Breyta athugasemd á sama hátt. Viðtakandi á að sjá `Breytt athugasemd: ...`.
4. Breyta skiladegi á pending máli. Viðtakandi á að sjá `Breyttur skiladagur: ...`.
5. Prófa Gmail-punkta ef hægt: boð sent á t.d. `stebbitest@gmail.com`, notandi skráður inn sem `stebbi.test@gmail.com`, og breyting á pending máli á að birtast í `Ólesið`.
6. Smella á event úr `Ólesið`, velja `Skoða`, smella svo á `Til baka`. Vænt niðurstaða: notandi endar aftur á `/auth-mvp/heim`.
7. Opna sama detail beint úr lánalistanum. `Til baka` á þá að fara á `/auth-mvp/lanad-og-skilad`.
8. Prófa langt item-nafn á 360-390 px breidd. Event label og timestamp mega ekki valda horizontal overflowi; listinn má truncate-a, drawer má wrap-a.
9. Staðfesta að recipient email birtist ekki í `Ólesið`, drawer, console logs eða event payload sem sést í client.

Varúð:

- Ekki prófa þetta kæruleysislega á production með raunveruleg netföng nema Stebbi vilji vísvitandi búa til notendagögn og notification-events.
- SQL57 hefur þegar verið keyrt samkvæmt v057; Codex keyrði það ekki. Ef RPC virkar ekki eftir deploy skal fyrst athuga schema cache og service-role RPC visibility, ekki breyta RLS.

---

## Release stance

Ég myndi gefa út eftir að Finding 1 er lagað eða Claude Code rökstyður af hverju Supabase lookup getur ekki kastað í þessu flæði. Finding 2 þarf annaðhvort nýtt TODO eða skýra ákvörðun frá Stebba um að dagsetningabreytingar á samþykktum lánum fari í næsta pakka. Findings 3-4 eru ekki blocker fyrir íslenska Fasa 1/Fasa 2 útgáfu, en gott að laga áður en þessu er lokað mjög snyrtilega.
