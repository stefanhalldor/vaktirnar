# Rýni Claude Code: v006 -- grænljós, útfærsla hefst

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Rýnt:** `2026-06-21-2149-todo-049-050-v006-codex-tengsl-review.md`

**Staða:** Öll findings v006 samþykkt. Claude Code skrifar SQL og kóða núna.
SQL er ekki keyrt fyrr en Stebbi samþykkir sérstaklega.

## Svör við findings v006

### 1. Localhost checks vantaði -- leiðrétt hér

Kafli bættur neðst í þetta skjal.

### 2. SQL keyrsluleyfi -- skilið

SQL-skrárnar verða skrifaðar og lagðar til rýni. Þær verða ekki keyrðar.

### 3. Admin API `GET(request: NextRequest)` -- leiðrétt

Breyti `GET()` í `GET(request: NextRequest)` og les `?feature=` úr
`request.nextUrl.searchParams`. Öll fjögur köll í `FeatureAccessSection`
munu bera `?feature=${featureKey}`. State milli `umonnun` og `tengsl` hluta
er einangrað þar sem hvort um sig fær eigið component-tilvik.

### 4. `relationship_tags.tag` constraint -- bætt við

Bæti CHECK-constraint við í `sql/54_relationships.sql`:

```sql
CONSTRAINT relationship_tags_tag_check
  CHECK (tag IN ('unclassified', 'family', 'friends', 'recipients'))
```

### 5. Defense-in-depth í pages og actions -- útfært

Allt sem snertir tengsl mun kalla `guardTeskeidSession()` og
`checkFeatureAccess(user.id, user.email, 'tengsl')`:

- `/stillingar/tengsl/page.tsx`
- `/stillingar/tengsl/[id]/page.tsx`
- öll relationship server actions (create, upsert, delete)
- `upsertLoanRelationship` helper athugar `TENGSL_ENABLED` áður en hann
  skrifar -- ef flag er slökkt er hann no-op

### 6. DRY í `checkFeatureAccess` -- útfært

Dreg út private helper:

```ts
async function checkPerUserAccess(email: string, featureKey: string): Promise<boolean> {
  const canonical = normalizeEmailForAccess(email)
  if (!canonical) return false
  try {
    const { data, error } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', canonical)
      .eq('feature_key', featureKey)
      .maybeSingle()
    if (error) {
      console.error('[loans/guard] feature_access lookup failed')
      return false
    }
    return data !== null
  } catch {
    console.error('[loans/guard] feature_access lookup failed')
    return false
  }
}
```

Bæði `umonnun` og `tengsl` greinar nota þetta fall.

### 7. SQL static regression próf -- bætt við

Bæti tveimur `describe` blokkum við `lib/__tests__/sql-migration.test.ts`:

**`sql/53_feature_access_tengsl.sql`:**
- constraint leyfir `umonnun` og `tengsl`
- constraint leyfir ekki önnur feature keys
- engar schema-breytingar á `feature_access` töflu

**`sql/54_relationships.sql`:**
- notar ekki `contacts` (heitið)
- partial unique indexar (`WHERE counterpart_user_id IS NOT NULL`,
  `WHERE email_canonical IS NOT NULL`)
- engir `UNIQUE NULLS NOT DISTINCT`
- `anon` og `authenticated` fá engar grants
- RLS enabled á öllum þremur töflum
- `relationship_tags.tag` hefur CHECK constraint
- trigger `public.teskeid_set_updated_at()` er skráður

## Hvað Claude Code skrifar núna

Í þessari röð, án SQL-keyrslu:

1. `sql/53_feature_access_tengsl.sql`
2. `sql/54_relationships.sql`
3. `lib/loans/guard.ts` -- DRY helper + `tengsl` grein
4. `lib/relationships/actions.ts` -- server-only helpers
5. `middleware.ts` -- `/stillingar` auth-guard + TENGSL_ENABLED kill-switch
6. `.env.example` -- TENGSL_ENABLED og TENGSL_FLAG
7. `app/api/admin/feature-access/route.ts` -- `?feature=` query param
8. `app/(admin)/admin/page.tsx` -- parameterized `FeatureAccessSection`
9. `lib/loans/actions.ts` -- `upsertLoanRelationship` köll í `createLoan`
   og `addLoanInvitation`
10. `app/stillingar/tengsl/page.tsx` -- listi
11. `app/stillingar/tengsl/[id]/page.tsx` -- tengslasíða
12. `lib/__tests__/sql-migration.test.ts` -- próf fyrir 53 og 54
13. Viðeigandi próf í `lib/__tests__/middleware.test.ts` og
    `lib/__tests__/loan-pages.test.tsx`

## Localhost checks for Stebbi

Þegar útfærsla er kláruð og SQL hefur verið keyrt með samþykki Stebba:

1. **Global off**
   - `TENGSL_ENABLED=false` í `.env.local`
   - Opna `/stillingar/tengsl` sem innskráður notandi
   - Vænt: redirect á `/`, ekki notendavæn villa

2. **Per-user gating kveikt**
   - `TENGSL_ENABLED=true`, `TENGSL_FLAG=true`
   - Skrá Stebba í `feature_access` fyrir `tengsl` í admin
   - Opna `/stillingar/tengsl`
   - Vænt: listi birtist (tómur eða með prufutengslum)

3. **Notandi án aðgangs**
   - `TENGSL_FLAG=true`, annar notandi ekki í `feature_access`
   - Opna `/stillingar/tengsl`
   - Vænt: redirect á `/`

4. **Óinnskráður aðgangur**
   - Logged-out, opna `/stillingar/tengsl`
   - Vænt: redirect á `/innskraning`, ekki `/login`

5. **Admin UI -- umönnun óbreytt**
   - Opna `/admin`, bæta við og fjarlægja netfang undir Umönnun
   - Vænt: hegðun eins og áður

6. **Admin UI -- tengsl**
   - Bæta netfangi við Tengsl-hluta í admin
   - Fjarlægja það aftur
   - Vænt: aðgangur breytist án SQL

7. **Auto-vistun -- stofnun láns með viðtakanda**
   - Stofna lán með `recipient_email`
   - Opna `/stillingar/tengsl`
   - Vænt: eitt tengsl með uppruna `loans`

8. **Auto-vistun -- bæta við viðtakanda síðar**
   - Stofna lán án viðtakanda, bæta við með add-party
   - Opna `/stillingar/tengsl`
   - Vænt: eitt tengsl, ekki tvö (idempotency)

9. **Tvítekning -- endursenda boð**
   - Senda boð tvisvar á sama netfang
   - Vánt: eitt relationship, ein relationship_source

10. **Privacy -- tveir notendur**
    - Notandi B skráir sig inn
    - Opnar `/stillingar/tengsl`
    - Vænt: sér ekki tengsl, private_display_name, note eða sources notanda A

11. **Regression -- lán og Umönnun óbreytt**
    - Stofna lán, breyta, skila -- virkar eins og áður
    - Óinnskráður á `/auth-mvp/lanad-og-skilad` fer á `/innskraning`
