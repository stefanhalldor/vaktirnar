# #37 v056 - Codex-rýni á Claude v055 Fasa 2 plan

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Codex

**Rýnt skjal:** `ai-handoff/2026-06-24-0824-todo-037-v055-claude-fasi2-revised-plan.md`

**Niðurstaða:** Fasi 1 er samþykktur. Fasi 2 er nú í réttri átt og leysir aðalathugasemd Codex um canonical duplicate notendur með því að skila öllum matching user IDs. En áður en Fasi 2 fer í framkvæmd þarf að herða nokkur atriði: RPC return-shape, rollback/deploy röð, villumeðhöndlun helpera og próf fyrir duplicate canonical matches.

## Findings

### Medium - Staðfesta þarf Supabase RPC return-shape fyrir `RETURNS SETOF uuid`

V055 leggur til SQL:

```sql
CREATE OR REPLACE FUNCTION public.get_user_ids_by_canonical_email(p_email text)
RETURNS SETOF uuid
...
```

og TypeScript:

```ts
const { data, error } = await admin.rpc('get_user_ids_by_canonical_email', { p_email: email })
return (data as string[]).filter(Boolean)
```

Þetta gæti verið rétt, en Claude Code þarf að staðfesta nákvæmlega hvernig Supabase/PostgREST skilar `SETOF uuid`. Til að minnka óvissu mælir Codex með að nota frekar:

```sql
RETURNS TABLE (user_id uuid)
```

og í TypeScript lesa:

```ts
return ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id).filter(Boolean)
```

Það er skýrara, prófanlegra og forðar því að appkóðinn treysti á óljósa scalar-array hegðun.

### Medium - Rollback er ekki "safe any time" ef appkóði er kominn út

V055 segir að rollback sé:

```sql
DROP FUNCTION IF EXISTS public.get_user_ids_by_canonical_email(text);
```

og að það sé öruggt hvenær sem er. Það þarf að orða varlegar.

Ef appkóði sem kallar helperinn er kominn út og function er droppað, þá brotnar ekki loan update, en pending-recipient notification fer aftur að falla niður. Þar sem Stebbi sagði að Gmail-punktagat væri ekki ásættanlegt má þetta ekki vera dulbúið permanent fallback.

Rollback-plan þarf að segja:

1. Ef verið er að rollback-a Fasa 2 viljandi, redeploy-a appkóða sem kallar ekki helperinn eða samþykkja tímabundið notification gap.
2. Síðan drop-a function.
3. Reload-a schema cache ef þarf.
4. Staðfesta að appið sé ekki að logga endurtekin RPC errors.

### Medium - Helper error má ekki vera algjörlega þögull

V055 helper skilar `[]` ef `admin.rpc` skilar error eða throw-ar. Það heldur update-flowinu gangandi, sem er gott, en ef function er vitlaust deployuð eða schema cache ekki reloadað getur notification verið bilað lengi án þess að nokkur sjái það.

Codex vill að helperinn loggi generic, non-sensitive villu, t.d.:

```ts
console.error('[loans/updateLoan] canonical recipient lookup failed')
```

Ekki logga email, canonical email, user IDs eða payload.

Próf ætti að staðfesta að error veldur ekki throw-i og að actor event skráist áfram.

### Medium - Fasi 2 deploy-röð þarf að vera skyldubundin, ekki bara ráðlegging

V055 segir að ef app code deployast á undan schema cache reload þá grípi helperinn error og skili `[]`, og að það sé ásættanleg tímabundin staða.

Codex vill herða þetta:

- Rétt deploy-röð er skylda fyrir Fasa 2: SQL → schema cache reload → staðfesta RPC visibility → deploy app.
- Error fallback er aðeins öryggisnet svo loan update brotni ekki, ekki samþykkt final hegðun.
- Closeout frá Claude Code þarf að segja hvort SQL var aðeins skrifað eða líka keyrt. Ef SQL var ekki keyrt, má Fasi 2 ekki teljast lokinn.

### Low/Medium - `ORDER BY created_at ASC` má bæta með deterministic tie-breaker

Þar sem function skilar öllum matching users skiptir röð ekki öryggislega miklu máli. Samt er betra að hafa deterministic röð:

```sql
ORDER BY created_at ASC, id ASC
```

Þetta hjálpar prófum og gerir hegðun stöðuga ef tveir auth users eru með sama `created_at`.

### Low - `PARALLEL SAFE` er óþarfi

`PARALLEL SAFE` er líklega ekki vandamál, en það er óþarfi í svona security-definer helper. Ef Claude Code vill halda migration sem einfaldastri má sleppa `PARALLEL SAFE`. Þetta er ekki blocker.

## Samþykkt scope

### Fasi 1

Codex samþykkir Fasa 1 til framkvæmdar:

- nákvæmari `Ólesið` labels;
- `from=heim` back-navigation;
- timestamp með hástaf og án leading zero.

Engin SQL í Fasa 1.

### Fasi 2

Codex samþykkir Fasa 2 sem stefnu, með þessum breytingum áður en framkvæmd hefst:

1. Nota helst `RETURNS TABLE (user_id uuid)` eða staðfesta örugglega `SETOF uuid` return-shape með prófi/mocking.
2. Bæta `ORDER BY created_at ASC, id ASC`.
3. Logga generic lookup-villu án viðkvæmra gagna.
4. Herða rollout/rollback orðalag.
5. Gera schema-cache reload að skyldu í deployment checklist.
6. Bæta duplicate canonical match prófum.

SQL má skrifa í repo sem migration, en ekki keyra á Supabase fyrr en Stebbi samþykkir það sérstaklega.

## Prófanir sem Codex vill sjá

### Fasi 1

- `npm run type-check`
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx`

### Fasi 2

- `npm run type-check`
- `npm run test:run -- lib/__tests__/actions.test.ts`
- Ef SQL migration static tests eru til eða bætt við: `npm run test:run -- lib/__tests__/sql-migration.test.ts`

Fasi 2 próf þurfa að staðfesta:

- venjulegt netfang fær pending-recipient event;
- dotted Gmail fær event;
- Googlemail fær event;
- canonical duplicate: allir matching user IDs fá event;
- actor á matching lista fær ekki afrit af recipient event;
- enginn matching user: engin throw, actor event skráist áfram;
- RPC/helper error: engin throw, actor event skráist áfram, generic log án email/user IDs;
- actor event er `initiallyRead: true`;
- recipient events eru ekki `initiallyRead`;
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

1. Staðfesta að SQL57 hafi verið keyrt og schema cache reloadað áður en appkóði sem notar helperinn er deployaður.
2. Breyta skiladegi á máli þar sem viðtakandi hefur ekki smellt `Þekki málið`.
3. Skrá inn sem viðtakandi og staðfesta event í `Ólesið`.
4. Endurtaka með Gmail-netfangi með punktum.
5. Ef hægt er að setja upp canonical duplicate test-state, staðfesta að allir samþykktir matching users fá event.

Ekki prófa production SQL eða production gagnabreytingar kæruleysislega. SQL keyrsla, schema-cache reload og deploy-röð þurfa sérstakt samþykki frá Stebba.

## Óvissa / þarf að staðfesta

- Codex keyrði ekki browser/manual localhost check.
- Codex staðfesti ekki raunverulega Supabase/PostgREST return-shape fyrir `RETURNS SETOF uuid`; þess vegna er mælt með `RETURNS TABLE`.
- Fasi 1 er tilbúinn.
- Fasi 2 er næstum tilbúinn sem migration-plan, en þarf breytingarnar hér að ofan áður en hann er framkvæmdur.
