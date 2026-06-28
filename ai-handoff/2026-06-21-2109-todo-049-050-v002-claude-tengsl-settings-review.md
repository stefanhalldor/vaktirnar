# Rýni Claude Code: #49 og #50 sem `/stillingar/tengsl`

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Staða:** Claude Code rýnir v002 handoff frá Codex. Codex á að lesa þetta
áður en kóðavinna hefst.

## Heildarsmat

Stefnan í v002 er skynsamleg og vel rökstudd. Að sameina #49 og #50 undir
einu `/stillingar/tengsl` route passar við það sem er þegar til í kóðagrunni
og forðast tvítektar gagnalausnir. Planlægjanáðin (schema-plan á undan SQL)
er rétt. Neðangreindar athugasemdir eru mestmegnis forvarnar og skilgreinar
spurningar -- ekki grundvallarbreytingar á stefnunni.

## 1. Full route-slóð

Handoffið nefnir `/stillingar/tengsl` án þess að staðfesta heildarprefixið.
Allar innskráningarbundnar síður í þessum kóðagrunni nota `/auth-mvp/` prefix:

- `/auth-mvp/heim`
- `/auth-mvp/lanad-og-skilad`
- `/auth-mvp/minn-profill`

Fullt app-path verður því `/auth-mvp/stillingar/tengsl` og
`/auth-mvp/stillingar/tengsl/[id]`.

**Codex þarf að staðfesta þetta við Stebba áður en routes eru búnar til.**

## 2. Middleware vantar guard

Middleware (`middleware.ts`) gæslar `/auth-mvp/heim`, `/auth-mvp/minn-profill`
og `/auth-mvp/lanad-og-skilad` sérstaklega þannig:

```ts
if (!user && pathname.startsWith('/auth-mvp/heim')) {
  // redirect to /innskraning
}
```

`/auth-mvp/stillingar` er **ekki** gæsluð. Þar sem `stillingar` er ekki í
`PUBLIC_PATHS` mun annar kóðagrein taka við (`!user && !isPublic &&
!isAuthCallback` → redirect til `/login`, sem er legacy login), en það er ekki
æskileg hegðun -- ætti að fara á `/innskraning`.

**Þarf:** Bæta við guard í middleware:

```ts
if (!user && pathname.startsWith('/auth-mvp/stillingar')) {
  const url = request.nextUrl.clone()
  url.pathname = '/innskraning'
  return NextResponse.redirect(url)
}
```

Bæta við test í `lib/__tests__/middleware.test.ts` (sjá mynstur úr `describe
'middleware — /auth-mvp/heim route'`).

## 3. SQL-númer

Næsta migration er `sql/53_*.sql`. Nýjasta er `52_feature_access.sql`.
Handoffið nefnir ekki númer; Codex þarf að nota 53 fyrir tengsl-schema.

## 4. Feature access flag

`52_feature_access.sql` stýrir hvort notandi hefur aðgang að tilteknum
Teskeiðum (`loans_enabled`, `umonnun_enabled` o.fl.). Ef `/stillingar/tengsl`
á líka að vera gæslað þarf:

- Annað hvort nýtt feature flag (t.d. `tengsl_enabled`)
- Eða sú ákvörðun að `stillingar/tengsl` sé opið öllum innskráðum notendum án
  sérstaks flags

Handoffið er þögult hér. **Þarf svör Stebba** áður en middleware og
preflight-köll eru hönnuð.

## 5. Auto-vistunartími: halda í skinni

Handoffið spyr nákvæmlega: hvenær á mótaðili að vistast sem tengsl? Þetta er
rétta spurningin. Tillaga:

- **Ekki** vista við innslætti netfangs -- notandi kann að vera að slá inn
  typo eða prófa.
- **Vista þegar boð er sent** (`add_loan_invitation` RPC kallað með gildu
  netfangi). Þetta er fyrsta merki um yfirlýsta fyrirætlan.
- Ef mótaðili er þegar skráður notandi og `auth.users.email` passar: tengja
  við UUID í stað þess að geyma email-streng.
- Ef mótaðili er óþekktur: geyma email-streng tímabundið og uppfæra í UUID
  þegar hann skráir sig (eða þegar invitation er claimed).

Gmail-punktamálið úr #43 (t.d. `stebbi@gmail.com` = `s.tebbi@gmail.com`)
þarf að fara í gegnum sama normaliseringsflæði og nú þegar er til.

## 6. Gagnalíkan: tillaga að forgangsröð

Handoffið gefur vinnunöfn. Tillaga sem passar við repo-mynstur:

```
contacts              -- per-user tengslafærsla
  id uuid pk
  owner_id uuid       -- innskráður notandi (FK auth.users)
  user_id uuid null   -- mótaðili ef hann er skráður notandi
  email text null     -- ef mótaðili er ekki enn skráður
  display_name text null  -- einkanafn eiganda
  note text null
  created_at timestamptz
  updated_at timestamptz

contact_tags          -- tags á tengsl
  id uuid pk
  contact_id uuid FK contacts
  tag text            -- 'untagged', 'family', 'friends', 'recipients', ...

contact_sources       -- hvaðan tengslin komu
  id uuid pk
  contact_id uuid FK contacts
  source_type text    -- 'loans'
  source_id uuid      -- id færslunnar í uppruna-Teskeið
```

Í stað `contact_tags` töflu má byrja með `tag text[]` dálk beint á `contacts`
ef fyrsta útgáfa notar bara einn tag. Einfaldara til að byrja.

RLS: `owner_id = auth.uid()` á öllum policies. Enginn broad authenticated
read.

## 7. Cross-Teskeið activity: seinkið

Handoffið er rétt að benda á að activity-index þvert á allar Teskeiðar getur
orðið of stór fyrsta breyting. **Mæli eindregið með read-through fyrst:**

Fyrsta útgáfa af `/stillingar/tengsl/[id]`:
- Sýnir nafn, tags, uppruna, einkalýsingu.
- Ef `source_type = 'loans'`: einn `JOIN` við `loan_items` og
  `loan_invitations` til að sækja viðeigandi færslur.
- Engin almenn activity-tafla í v1.

Event-index bætist við þegar önnur Teskeið (Útlagt og endurgreitt, Fyrsta
vakt krakkanna) þurfa sama mynstur.

## 8. Barn og óinnskráður mótaðili

Handoffið nefnir að fjölskyldumeðlimur getur verið barn eða óinnskráður. Þetta
er raunveruleg fylgni sem þarf sérstaka hönnun:

- Barn á sér engan `auth.users` skrá.
- `user_id` í `contacts` verður `NULL`.
- `email` í `contacts` verður líka `NULL` (barn hefur ekki email).
- `display_name` geymir barnsnafn (einkanafn eiganda) -- **má ekki leka**.

Fyrsta útgáfa: leyfa manuelt-búin tengsl (notandi bætir við nafni handvirkt,
engin auto-vistun). Auto-vistun úr Lánað og skilað gildir aðeins þegar
viðtakandi er fullorðinn með email.

## 9. Umfang fyrstu útgáfu -- tillaga

Til að forðast scope creep og tryggja að þetta sé hægt að gefa út í einum
diff:

**Innifalið í v1:**

- `sql/53_contacts.sql`: `contacts`, `contact_sources` töflur, RLS, grants.
- Middleware guard á `/auth-mvp/stillingar`.
- `/auth-mvp/stillingar/tengsl/page.tsx`: listi yfir tengsl eiganda, tómt
  state ef engin.
- `/auth-mvp/stillingar/tengsl/[id]/page.tsx`: nafn, tags, uppruni, link
  til baka í `Lánað og skilað` ef source er `loans`.
- Auto-vistun í `addLoanInvitation` action þegar boð er sent með gildu email.
- Próf: RLS (tveir notendur sjá ekki hvert annars gögn), middleware, pages.

**Ekki í v1:**

- Tags-breytingar í UI (lesaðeins tags í bili).
- Activity feed / cross-Teskeið queries.
- Barn/óinnskráður mótaðili (geymt til Fyrsta vakt krakkanna).
- Tengsl úr öðrum Teskeiðum en Lánað og skilað.
- Leitarbox eða fellilisti af tengslum í lánaformi.

## 10. Spurningar sem þarf svör Stebba á áður en kóðavinna hefst

1. Er `/auth-mvp/stillingar/tengsl` rétt full slóð, eða á `stillingar` að
   vera á öðru stigi?
2. Á `stillingar/tengsl` að vera gæslað af feature flag eða opið öllum
   innskráðum?
3. Auto-vistun: á mótaðili að vistast þegar boð er **sent** (tillaga) eða
   þegar það er **samþykkt**?
4. Á `contacts` töflunafnið að vera á ensku eins og aðrar töflur
   (`loan_items`, `loan_invitations`) eða má nota íslenskt heiti?

## Niðurstaða

v002 handoff er vandaður grunnur. Codex á að:

1. Fá svör við 4 spurningunum að ofan frá Stebba.
2. Skrifa schema-plan (engin SQL enn) og senda til Stebba til samþykktar.
3. Eftir samþykki: skrifa `sql/53_contacts.sql` og biðja um keyrsluleyfi.
4. Útfæra middleware guard, pages og actions í einum PR eftir SQL er staðfest.
