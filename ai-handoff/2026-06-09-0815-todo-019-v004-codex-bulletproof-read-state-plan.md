# TODO #19 - Bulletproof `Nylegt` read-state plan

**Dagsetning:** 2026-06-09 08:15
**Agent:** Codex
**Tengt TODO:** #19 Lesnir hlutir birtist ekki aftur sem `Nylegt`
**Stada:** Nytt plan eftir ad Stebbi stadfesti ad fyrri lagfaering virkar ekki nogu vel.
**Mjog mikid:** Claude Code skal fyrst ryna planid og skila eigin mati. Ef SQL/migration tharf ad fara inn skal Claude Code ekki keyra SQL og ekki deploya nema Stebbi gefi serstakt leyfi.

## Stutt nidurstada

Nuna er til cookie-v2 lausn med per-item keys:

- `lib/loans/recent-read.ts`
- `lib/loans/recent-read.server.ts`
- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- tests i `lib/__tests__/home-page.test.tsx` og `lib/__tests__/recent-read.test.ts`

Hugmyndin er rettari en gamla list-signature leidin, en ef Stebbi ser ad hun virkar ekki i raun, tha er hun ekki nogu traust fyrir production UX.

Codex mælir nu med ad fara alla leid: geyma read-state server-side i Supabase, med litilli afmarkadri toflu og server action. Tha er `Nylegt` ekki had browser cookie, app-router client cache, path-migration, soft navigation eda device-specific state.

## Liklegar orsakir ad nuverandi lausn klikkar

Codex sa ekki runtime sjalfur, en koda-lestur bendir a thessar veikleika:

1. `RecentSection` skrifar cookie i browser og setur local `isRead=true`, en kallar ekki server action og tryggir ekki ad server render faei strax ferskt read-state.
2. `createLoan` og adrar loan mutations revalidate-a bara `/auth-mvp/lanad-og-skilad`, ekki `/auth-mvp/heim`, tho heimaskjarinn er haedur loan gognunum.
3. Tests mocka server cookie beint med `setupCookieV2`; tha vantar end-to-end-ish regression fyrir raunverulegt `click Lesid -> state persistar -> ny loan -> /heim reiknar rett`.
4. Cookie-lausn er per browser. Ef notandi notar annan browser/device, hreinsar cookies, eda lendir i client cache hegðun, getur UX ordid otryggt.

## Recommended direction: server-side read-state

### Markmid

`Nylegt` a ad syna fyrstu 3 unread loan rows fyrir innskradan notanda.

Hlutur er read ef:

- read-state tafla hefur row fyrir `(user_id, loan_id)`, og
- geymdur `read_key` passar vid nuverandi computed key fyrir hlutinn.

Hlutur verdur aftur unread ef efnislegt adstada breytist, t.d.:

- `item_name`
- `loaned_at`
- `due_at`
- `returned_at`
- `my_role`
- overdue state

Hlutur ma ekki birtast aftur bara vegna thess ad:

- ny loan row bætist vid
- listi refetchast
- top-3 sorting breytist
- notandi fer milli sida eda refreshar

## SQL migration

Claude Code skal ryna hvort naesta migration numer se `sql/44_...`. Ef `sql/43_open_loans.sql` er enn nyjast, mælt:

`sql/44_recent_read_state.sql`

Mælt tafla:

```sql
CREATE TABLE IF NOT EXISTS public.loan_recent_read_state (
  user_id  uuid        NOT NULL,
  loan_id  uuid        NOT NULL REFERENCES public.loan_items(id) ON DELETE CASCADE,
  read_key text        NOT NULL CHECK (read_key ~ '^[0-9a-f]{32}$'),
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, loan_id)
);

CREATE INDEX IF NOT EXISTS loan_recent_read_state_user_read_at_idx
  ON public.loan_recent_read_state (user_id, read_at DESC);

ALTER TABLE public.loan_recent_read_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.loan_recent_read_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_recent_read_state TO service_role;
```

Codex mælir med ad sleppa FK i `auth.users` nema Claude Code finnur gott stadbundid mynstur fyrir thad i repo. `user_id` er stadfestur i server action med session guard. FK i `loan_items` med `ON DELETE CASCADE` er gagnleg og afmorkud.

Engar policies fyrir anon/authenticated. Service-role server code les/skrifar.

Rollback:

```sql
DROP TABLE IF EXISTS public.loan_recent_read_state;
```

Athugid:

- Þetta er schema/data-table breyting, en hun breytir ekki existing loan rows.
- Engin RLS veiking.
- Engar grants til anon/authenticated.
- Engir secrets, email eda API lyklar.
- Taflan geymir user/loan tengingu og hash, svo hun er user-data adjacent. Medhöndla varlega.

## Server helpers

Halda `computeRecentReadKey` server-side. Nuverandi helper er i lagi ad grunninum:

- 32 hex stafir er nog fyrir UX state.
- Key ma ekki innihalda raw item name i storage, bara hash.
- Ef `server-only` er nothad og Vitest kvartar, skyrir Claude Code thad i handoffi og velur testable mynstur.

Baeta vid helper sem tekur `loans` og read-state map:

```ts
function buildRecentRows(userId, loans, readStateMap) {
  return sortLoansForHome(loans)
    .map((loan) => ({ loan, key: computeRecentReadKey(userId, loan) }))
    .filter(({ loan, key }) => readStateMap.get(loan.id) !== key)
    .slice(0, 3)
}
```

Mikilvaegt: filtera read rows adur en `.slice(0, 3)` er gert.

## Heim page data flow

`app/auth-mvp/heim/page.tsx`:

1. Fetch `get_my_loans` eins og nu.
2. Ef loan fetch tekst og loans eru til:
   - lesa read-state rows ur `loan_recent_read_state` fyrir `user.id` og loan ids sem komu ur `get_my_loans`.
   - byggja `Map<loan_id, read_key>`.
3. Reikna `recentRows` med server-side read-state.
4. Passa `recentRows` til `RecentSection`.

Ef read-state table query failar:

- Ekki fela `Nylegt`.
- Treat sem unread og logga generic error, ekki leka loan ids/notendagögnum.
- Þetta er degrade-safe: notandi sér frekar of margt sem unread en ekkert.

## Mark-read server action

Bua til server action, t.d.:

`app/auth-mvp/heim/actions.ts` eda `lib/loans/recent-actions.ts`

Mælt API:

```ts
export async function markRecentLoansRead(input: unknown): Promise<ActionResult>
```

Input:

```ts
{
  loan_ids: string[] // max 3 or max 10
}
```

Server action skal:

1. `guardTeskeidSession()`.
2. Staðfesta `LOANS_ENABLED` / `checkFeatureAccess(user.id, user.email, 'lanad-og-skilad')`.
3. Validate-a UUID array, max 3 visible rows eða max 10.
4. Fetch-a `get_my_loans` fyrir actor.
5. Sía niður i loan ids sem actor raunverulega ma sja.
6. Reikna current `read_key` server-side fyrir þessi loans.
7. Upsert-a i `loan_recent_read_state`:
   - `user_id`
   - `loan_id`
   - `read_key`
   - `read_at = now()`
8. `revalidatePath('/auth-mvp/heim')`.
9. Skila `{ ok: true }`.

Ekki treysta client-sendum keys. Client ma senda loan ids, en server reiknar keys sjalfur.

Ef engar valid/accessible loan ids eru eftir, skila ok eda `not_found` eftir mynstri repo, en ekki kasta raw error til client.

## `RecentSection`

Fjarlægja browser-cookie logik ur `RecentSection`.

Nytt flæði:

- `RecentSection` fær `rows`.
- Smellur a `Lesid` kallar server action med `rows.map(r => r.loan.id)`.
- Optimistic UI ma syna done banner eftir success.
- Ef action failar, syna stutt error eða halda `Nylegt` synilegu.
- Eftir success: `router.refresh()` auk þess sem server action gerir `revalidatePath('/auth-mvp/heim')`.

Til ad verja gegn stale local state:

- Reikna `rowBatch = rows.map(r => r.key).join('.')`.
- Local done gildir bara fyrir sama batch.
- Ef props breytast og ny unread rows koma, ma local done ekki fela thær.

## Revalidation fyrir loan mutations

Nuna revalidate-ar `lib/loans/actions.ts` fyrst og fremst:

`/auth-mvp/lanad-og-skilad`

Það er ekki nog fyrir heimaskja.

Claude Code skal búa til litinn helper:

```ts
const LOANS_PATH = '/auth-mvp/lanad-og-skilad'
const HOME_PATH = '/auth-mvp/heim'

function revalidateLoanViews() {
  revalidatePath(LOANS_PATH)
  revalidatePath(HOME_PATH)
}
```

Nota hann i ollum loan mutations sem geta breytt `Nylegt` eða badge:

- `createLoan`
- `updateLoan`
- item details update ef #23/#24 bætist vid sidar
- `markReturned`
- `undoReturn`
- `deleteLoan`
- `claimInvitation`
- `addLoanInvitation`
- `cancelInvitation`
- invitation send/reserve actions ef heim badge/status getur breyst

Þetta er liklega hluti af nuverandi bugga og a ekki ad bidja eftir stærra #23/#24 verki.

## Tests sem þurfa ad gripa raunverulega bilun

### SQL/static tests

I `lib/__tests__/loans.test.ts` eda nyju test file:

- migration `sql/44_recent_read_state.sql` er til.
- tafla heitir `loan_recent_read_state`.
- RLS enabled.
- no grants til anon/authenticated.
- service_role grants eru afmörkuð.
- `read_key` checkar 32 hex.
- FK `loan_id -> loan_items(id) ON DELETE CASCADE`.

### Helper tests

- `computeRecentReadKey` deterministic.
- key breytist fyrir `item_name`, `loaned_at`, `due_at`, `returned_at`, `my_role`, overdue.
- key geymir ekki raw loan data.
- `buildRecentRows` filterar fyrir slice:
  - first 3 read => 4th unread birtist.
  - read A + new B => A birtist ekki, B birtist.

### Server action tests

- action hafnar invalid UUID input.
- action cappar fjölda ids.
- action sækir `get_my_loans` og upsertar aðeins accessible loans.
- client-sent unknown loan id er ignorad/hafnad.
- action skrifar server-computed key, ekki client key.
- action kallar `revalidatePath('/auth-mvp/heim')`.

### Home page tests

- þegar read-state table hefur matching `(loan_id, read_key)`, loan birtist ekki i `Nylegt`.
- þegar read_key er stale, loan birtist aftur.
- read A + create/fetch B => A birtist ekki, B birtist.
- first 3 sorted read => 4th unread birtist.
- read-state query failar => loans birtast sem unread, page crashar ekki.

### RecentSection tests

- smellur a `Lesid` kallar server action med visible loan ids.
- eftir success synir done banner.
- eftir failure synir ekki falskt done sem festist.
- ny `rows` props eftir local done birtast ef batch breytist.
- component skrifar ekki lengur `document.cookie`.

### Revalidation tests

Uppfæra action tests til ad stadfesta ad loan mutations revalidate-a bæði:

- `/auth-mvp/lanad-og-skilad`
- `/auth-mvp/heim`

Sérstaklega `createLoan`, þvi buggið birtist eftir nyjan hlut.

## Manual test fyrir Stebba

Eftir framkvæmd:

1. Opna `/auth-mvp/heim`.
2. Sjá `Nylegt`.
3. Smella `Lesid`.
4. Hard refresha `/auth-mvp/heim`: lesnu hlutirnir koma ekki aftur.
5. Fara i `Lánad og skilad`, skra nyjan hlut.
6. Fara aftur a `/auth-mvp/heim`: nyi hluturinn birtist, gamlir lesnir ekki.
7. Loka/opna browser eða prófa incognito med sama login ef auðvelt: server-side read-state a ad haldast fyrir sama account.
8. Breyta hlut efnislega eða merkja skilað: hlutur ma birtast aftur sem unread.

## Stoppskilyrði

Claude Code skal stoppa og skila handoff ef:

1. Migration numer/ordun er óljós.
2. Direct service_role table select/upsert virðist brjóta repo mynstur og RPC væri betri.
3. SQL krefst RLS veikingar eða grants til anon/authenticated.
4. Read-state þarf að geyma raw item names, display names eða emails.
5. Tests krefjast stórra óskyldra breytinga á home page eða loan sorting.
6. Lausnin gæti haft áhrif á production loan data utan nýju read-state töflunnar.

## Ef Stebbi vill emergency fix án SQL

Codex mælir ekki með þessu sem bulletproof lausn, en ef migration má alls ekki fara inn strax:

- Halda cookie-v2.
- `RecentSection` kalli `router.refresh()` eftir cookie write.
- Local done state verði batch-bound, ekki einfalt `isRead`.
- Allar loan mutations revalidate-i `/auth-mvp/heim`.
- Bæta við tests sem sanna click -> refresh -> ny loan flæði.

Þetta gæti lagað current bug en er samt veikari en server-side read-state.

## Codex recommendation

Fara i server-side read-state. Þetta er litil afmörkuð migration, en hún fjarlægir heilan flokk af cookie/cache/device vandamálum.

Claude Code skal fyrst skila stuttu framkvæmdarplani:

1. nákvæmt migration nafn og SQL,
2. hvort direct table access eða RPC verður notað,
3. hvaða server action verður til,
4. hvaða tests verða skrifuð,
5. hvaða loan actions fá `HOME_PATH` revalidation,
6. hvernig rollback/recovery er hugsað.

Codex vill rýna það plan áður en SQL eða kóðabreytingar fara í gang.
