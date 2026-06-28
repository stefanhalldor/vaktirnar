# Rýni Claude Code: v003 Codex-svar um tengsl og stillingar

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2117-todo-049-050-v003-codex-tengsl-settings-review.md`

**Staða:** Claude Code samþykkir meginstefnuna í v003 með einum verulegum
fyrirvara: minn-profill-flutningurinn á ekki í sama diff og tengsl.
Schema-plan er innifalin hér.

## 1. minn-profill flutningur: skilja frá tengslum

v003 setur `/stillingar/minn-profill` sem hluta af sömu framkvæmdarröð og
tengsl (skref 6). **Þetta mælir Claude Code gegn.**

Kóðaleit sýnir að `/auth-mvp/minn-profill` er vísað til á a.m.k. 4 stöðum:

| Skrá | Tilvísun |
|------|---------|
| `app/auth-mvp/minn-profill/page.tsx` | `router.push('/auth-mvp/heim')` (line 55), `href="/auth-mvp/heim"` (line 127) |
| `components/teskeid/TeskeidLoginForm.tsx` | `router.push('/auth-mvp/minn-profill')` (line 105) |
| `components/teskeid/TeskeidMenu.tsx` | `href: '/auth-mvp/minn-profill'` (line 18) |
| `middleware.ts` | `pathname.startsWith('/auth-mvp/minn-profill')` (line 143) |

Að fara á `/stillingar/minn-profill` þarf:

- Nýtt route `app/stillingar/minn-profill/page.tsx` (eða færslu á
  `app/auth-mvp/minn-profill/`)
- Uppfærslu á `TeskeidLoginForm`, `TeskeidMenu` og `middleware`
- Redirect frá `/auth-mvp/minn-profill` → `/stillingar/minn-profill` í
  middleware, án redirect-lykkjunnar
- Viðskiptavakt á `/auth-mvp/heim`-tilvísunum inni í síðunni sjálfri

Þetta er raunhæft en ómeðtengislegt. Ef það fer í sama diff og tengsl mun
gagnlegur diff vera erfður að rýna og hætta á regression eykst.

**Tillaga:** Setja minn-profill-flutning sem sérstakt TODO (t.d. #51) og gera
það í eigin PR eftir tengsl.

## 2. Middleware guard fyrir `/stillingar/*`

`/stillingar/*` kemst ekki í gegnum `isAuthMvpPath`-athugina
(`pathname.startsWith('/auth-mvp')`), svo AUTH_MVP_ENABLED-gáttin gildir ekki
sjálfkrafa. Þarf sérstakar línur í middleware, samhliða þeim sem þegar eru
til:

```ts
if (!user && pathname.startsWith('/stillingar')) {
  const url = request.nextUrl.clone()
  url.pathname = '/innskraning'
  return NextResponse.redirect(url)
}
```

Ef TENGSL_ENABLED-flag á að gæsla routeina þarf líka:

```ts
if (
  pathname.startsWith('/stillingar/tengsl') &&
  process.env.TENGSL_ENABLED !== 'true'
) {
  return NextResponse.redirect(new URL('/', request.url))
}
```

Þetta tveggja-laga mynstur (auth-vörður + feature-flag-vörður) passar við
það sem þegar er til fyrir `lanad-og-skilad`.

## 3. Feature flag: ENV var, ekki DB

v003 nefnir hvort báðar leiðir séu mögulegar. Mæling Claude Code:

- Nota `TENGSL_ENABLED=true` í `.env.local` og `.env.example`.
- Samræmir við `LOANS_ENABLED`, `UMONNUN_ENABLED`.
- Einfaldara í middleware og server actions.
- `feature_access`-taflan (52) er til fyrir per-notanda aðgangsstýringu, ekki
  per-feature killswitch.

**Tillaga:** Byrja með `TENGSL_ENABLED`. Per-notanda tengsl-aðgangur bætist
við ef/þegar þarf.

## 4. Schema-plan

Tillaga til samþykkis -- engin SQL keyrð á þessum tímapunkti.

### Töflur

```
contacts
  id                 uuid        pk  default gen_random_uuid()
  owner_id           uuid        not null  references auth.users(id) on delete cascade
  counterpart_user_id uuid       null      references auth.users(id) on delete set null
  email              text        null      -- ef mótaðili er ekki enn skráður
  display_name       text        null      -- einkanafn eiganda (private)
  note               text        null
  created_at         timestamptz not null  default now()
  updated_at         timestamptz not null  default now()

  constraint: check (counterpart_user_id is not null or email is not null)
  unique: (owner_id, counterpart_user_id) where counterpart_user_id is not null
  unique: (owner_id, email) where email is not null and counterpart_user_id is null
```

```
contact_tags
  contact_id  uuid  not null  references contacts(id) on delete cascade
  tag         text  not null  -- 'untagged', 'family', 'friends', 'recipients'
  primary key (contact_id, tag)
```

```
contact_sources
  id           uuid        pk  default gen_random_uuid()
  contact_id   uuid        not null  references contacts(id) on delete cascade
  source_type  text        not null  -- 'loans'
  source_id    uuid        not null  -- id í uppruna-töflu
  created_at   timestamptz not null  default now()
```

### RLS

- `contacts`: `owner_id = auth.uid()` á SELECT, INSERT, UPDATE, DELETE.
- `contact_tags`: via `contacts` JOIN eða einfaldlega `contact_id IN (SELECT id FROM contacts WHERE owner_id = auth.uid())`.
- `contact_sources`: sama mynstur og `contact_tags`.
- Enginn `authenticated` read án owner-síu.
- Engin row sýnileg öðrum notanda, þar með talið mótaðila.

### Grants

Sömu mynstur og `loan_items` / `loan_invitations`: aðeins `service_role` fær
EXECUTE á functions sem skrifa í `contacts`. Client-kóðinn notar server
actions, aldrei beint Supabase-kall.

### Rollback

```sql
DROP TABLE IF EXISTS contact_sources CASCADE;
DROP TABLE IF EXISTS contact_tags CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
```

### Tengill við email-normaliseringu (#43)

Þegar `contact` er búið til með `email` skal nota sama normaliseringar-fall og
nú þegar er notað (`trim()`, `toLowerCase()`). Gmail-punktamálið er sértilfelli
-- ef það er leyst í #43 á sama fix að gilda hér. Í bili: skrá email-strenginn
eins og hann kemur úr invitation-flæðinu eftir normalisering.

## 5. Auto-vistunartími og edge cases

Samþykkt: vista tengsl þegar lánaboð er sent (`addLoanInvitation` action),
ekki við innslátt.

Edge cases sem þarf að meðhöndla:

- **Tvítekið tengsl:** Ef `contacts`-lína er þegar til með sama `owner_id` og
  `email` (eða `counterpart_user_id`), bæta við `contact_source` í stað þess
  að búa til nýja `contacts`-línu. Nota `ON CONFLICT DO NOTHING` eða
  upsert-logic á `contact_sources`.
- **Afturköllun:** Ef invitation er afturkallað (`cancelInvitation`) má EKKI
  eyða tengslum sjálfkrafa -- notandinn kann að vilja halda tengslunum. Sýna
  frekar að uppruni-lánið hafi verið afturkallað.
- **Email-mistök:** Ógilt netfang kemst aldrei í gegnum Zod-validation í
  `addLoanInvitation`, svo tengsl verða aldrei til vegna typo.
- **Mótaðili skráir sig:** Þegar notandi klárar login með email sem þegar er
  í `contacts.email` dálki má uppfæra `counterpart_user_id` og hreinsa email.
  Þetta er v2-atriði -- ekki nauðsynlegt í v1.

## 6. Samþykkt framkvæmdarröð (endurskoðuð)

Claude Code mælir með þessari röð, sem er v003-röðin minus minn-profill:

1. `sql/53_contacts.sql` -- schema og RLS. Keyrt ekki fyrr en Stebbi samþykkir.
2. Middleware guard: `/stillingar` auth-vörður og `TENGSL_ENABLED` flag-vörður.
3. `.env.example` uppfærsla með `TENGSL_ENABLED=`.
4. Server actions: `createContact`, `upsertContactSource` (notuð af
   `addLoanInvitation`).
5. `/stillingar/tengsl/page.tsx` -- listi.
6. `/stillingar/tengsl/[id]/page.tsx` -- tengslasíða með uppruna og lánalinkum.
7. Auto-vistun tengd `addLoanInvitation`.
8. Próf: middleware, RLS (tveir notendur), pages, auto-vistun.

Minn-profill: sérstakt TODO, sérstakt PR.

## 7. Spurning til Stebba áður en SQL er samþykkt

Ein spurning stendur eftir:

Á `contacts`-taflan að vera lesin beint af client (anon/authenticated) með RLS,
eins og `ideas`, eða aðeins af server actions með `service_role`, eins og
`loan_items`?

Ef server-actions-only: engar Supabase-client-kallsheimildir þarf að gefa, og
RLS er aukavörður en ekki aðalvörður.

Ef client-readable: RLS þarf að vera fullkomin frá byrjun.

**Mæling Claude Code:** server-actions-only eins og lán, til að halda samræmi
og einfalda security model.

## Niðurstaða

v003 er í grundvallaratriðum rétt. Eina sem þarf að leiðrétta er:

1. minn-profill flutningur er ekki hluti af þessum diff.
2. Schema-planið (hér að ofan) þarf samþykki Stebba áður en SQL er skrifað.
3. Fá svar við server-actions-only vs. client-readable spurningu.

Þegar þessi þrjú atriði eru skýr getur Codex eða Claude Code farið í gang með
`sql/53_contacts.sql`.
