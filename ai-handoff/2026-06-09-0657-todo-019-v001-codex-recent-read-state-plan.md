# TODO #19 - Codex handoff plan for `Nýlegt` read state

**Dagsetning:** 2026-06-09 06:57
**Agent:** Codex
**Tengt TODO:** #19 Lesnir hlutir birtist ekki aftur sem `Nýlegt`
**Hlutverk:** Claude Code er framkvæmdaaðilinn. Codex er að skila plani og áhætturýni.

## Stutt niðurstaða

Núverandi `Nýlegt` read-state er of gróft. `app/auth-mvp/heim/page.tsx` reiknar einn `recentSig` fyrir topp 3 sýnilegu lánin og `RecentSection` vistar þann signature í cookie `teskeid_recent_read`.

Það þýðir að ef nýr hlutur bætist við, röðun breytist eða listinn refetchast með nýju payloadi, passar gamli signature-inn ekki lengur. Þá geta hlutir sem notandi var búinn að merkja lesna birst aftur sem `Nýlegt`.

Codex mælir með per-item read keys í stað eins list-signature.

## Það sem Codex skoðaði

Codex skoðaði read-only:

- `TODO.md`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/loans/sort.ts` var ekki lesin í þessari lotu, en Claude Code skal skoða hana áður en kóðað er.

Codex gerði engar kóðabreytingar fyrir #19.

## Markmið

`Nýlegt` á aðeins að sýna hluti sem notandi hefur ekki merkt lesna.

Lesnir hlutir mega ekki koma aftur bara vegna þess að:

- nýr hlutur var búinn til
- listi var refetchaður
- röðun breyttist
- annar hlutur breyttist

Ef hluturinn sjálfur breytist efnislega, t.d. `returned_at`, `due_at`, heiti eða overdue state, má hann hins vegar hugsanlega verða unread aftur. Claude Code skal gera þá reglu skýra í kóða og tests.

## Mælt nálgun

### 1. Skipta út list-signature fyrir item read keys

Í stað:

```ts
const recentLoans = sortLoansForHome(loans).slice(0, 3)
const recentSig = computeRecentSignature(recentLoans)
const initialRead = recentLoans.length > 0 && readSig === recentSig
```

Nota:

```ts
const sortedLoans = sortLoansForHome(loans)
const readKeys = parseRecentReadCookie(cookieValue)
const recentRows = sortedLoans.map((loan) => ({
  ...loan,
  recentReadKey: computeRecentReadKey(user.id, loan),
}))
const unreadRecentRows = recentRows
  .filter((loan) => !readKeys.has(loan.recentReadKey))
  .slice(0, 3)
```

Mikilvægt: filtera út lesin atriði áður en skorið er niður í 3. Annars getur fjórði ólesni hluturinn horfið ef fyrstu þrír eru lesnir.

### 2. Reikna stable, privacy-safer key

Ekki geyma item name, other user name eða raw payload í cookie.

Mælt:

```ts
sha256([
  user.id,
  loan.id,
  loan.item_name,
  loan.loaned_at,
  loan.due_at ?? '',
  loan.returned_at ?? '',
  loan.my_role,
  overdue ? '1' : '0',
].join('|'))
```

Síðan má truncate-a hash í t.d. 32 hex stafi til að halda cookie stuttri. Þetta er UX state, ekki security token.

Vörumerking: Ef Claude Code vill að breytt `item_name` eigi ekki að gera hlut unread aftur, þá skal taka `item_name` út úr key. Codex hallar sér að því að ef heiti eða status breytist efnislega, þá megi hlutur birtast aftur sem nýlegt.

### 3. Nota nýja cookie útgáfu

Mælt cookie:

```txt
teskeid_recent_read_v2
```

Ástæða:

- Núverandi `teskeid_recent_read` geymir einn list-signature.
- Ný hegðun geymir marga per-item keys.
- Nýtt nafn forðast óljósa backward compatibility.

Mælt format:

```txt
key1.key2.key3
```

Eða örugg JSON parse ef það helst undir cookie-stærðarmörkum. Takmarka fjölda keys, t.d. síðustu 80, svo cookie verði ekki óendanleg.

Mælt path:

```txt
path=/
```

Ástæða: #22 mun síðar færa sýnilegar slóðir af `/auth-mvp/*`. Ef cookie er bundið við `/auth-mvp/heim` þarf að flytja það aftur síðar.

### 4. Uppfæra `RecentSection`

`RecentSection` þarf að fá visible unread rows og þeirra `recentReadKey`.

Við smell á `Merkja lesið`:

1. Lesa núverandi `teskeid_recent_read_v2` úr `document.cookie`.
2. Merge-a núverandi keys og visible row keys.
3. Deduplicate-a.
4. Trima í hámarksfjölda.
5. Vista cookie aftur með `SameSite=Lax`, `Max-Age=30 days`, `Secure` á HTTPS.
6. Setja local state þannig að section sýni `done`.

Ekki nota `localStorage`; server þarf að geta reiknað initial render án client hydration hopps.

## Mæltar skrár

Claude Code mun líklega breyta:

```txt
app/auth-mvp/heim/page.tsx
app/auth-mvp/heim/RecentSection.tsx
lib/__tests__/home-page.test.tsx
```

Mögulega bæta við litlum helper:

```txt
lib/loans/recent-read.ts
lib/__tests__/recent-read.test.ts
```

Codex mælir með helper ef parsing, hashing og cookie trimming fer að taka meira en nokkrar línur.

## Tests

Lágmarks regression tests:

1. Notandi merkir A, B og C lesið; þegar D bætist við birtast ekki A, B eða C aftur.
2. Ef D er ólesinn birtist D sem `Nýlegt`.
3. Ef fyrstu þrír sorted hlutir eru lesnir en fjórði er ólesinn, þá birtist fjórði.
4. Ef hlutur breytist efnislega samkvæmt key-reglu, þá birtist hann aftur sem unread.
5. Cookie parsing þolir tómt, spillt eða of langt cookie value án þess að brjóta `/heim`.
6. Cookie trimming heldur stærð undir stjórn.

## Prófanir sem Claude Code skal keyra

```powershell
npm run type-check
npm run test:run
```

Ef Next rendering eða server/client boundary breytist óvenju mikið:

```powershell
npm run build
```

Ekki ræsa dev server; Stebbi sér um localhost.

## Handpróf fyrir Stebba

Á `/auth-mvp/heim`:

1. Sjá `Nýlegt` með ólesnum hlutum.
2. Smella `Merkja lesið`.
3. Búa til nýjan hlut í `Lánað og skilað`.
4. Fara aftur á `/heim`.
5. Staðfesta að gamlir lesnir hlutir birtist ekki aftur.
6. Staðfesta að nýi hluturinn birtist sem `Nýlegt`.

## Áhætta

- Cookie-stærð: ekki geyma óbounded lista.
- Privacy: ekki geyma item names eða nöfn annarra notenda í cookie.
- Semantics: ákveða skýrt hvaða breytingar á láni gera hlut unread aftur.
- Route migration: nota `path=/` eða plana sérstaklega fyrir #22.
- Hydration: ekki byggja initialRead eingöngu á client-only state.

## Ekki gera í þessu verki

- Ekki breyta loan sorting nema test sýni að það sé nauðsynlegt.
- Ekki bæta við gagnagrunnstöflu fyrir read state nema Stebbi samþykki sérstaklega.
- Ekki snerta RLS, SQL, RPC eða service_role functions.
- Ekki blanda #15 date formatting, #17 hugmyndum eða #22 route cleanup inn í þetta verk.

## Stoppskilyrði

Claude Code skal stoppa og skila handoff ef:

1. Lausnin virðist þurfa migration eða persistent server-side read-state.
2. Cookie þarf að geyma viðkvæm gögn.
3. Read-state semantics verða óljósari en planið gerir ráð fyrir.
4. Tests byrja að krefjast stórra breytinga á loan sorting eða home page query.

## Handoff frá Claude Code eftir framkvæmd

Claude Code skal skila:

1. Hvað var gert.
2. Hvaða read-state regla var valin.
3. Breyttar skrár.
4. Keyrðar skipanir og exit codes.
5. Hvort SQL var skrifað eða keyrt. Vænt svar: nei.
6. Handpróf fyrir Stebba.
7. Eftirstandandi áhætta fyrir Codex rýni.

