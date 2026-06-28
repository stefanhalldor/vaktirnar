# Handoff fyrir Claude Code: Rýna og laga `sql/56_normalize_email_canonical.sql`

**TODO:** #43 Gmail-punktar og útrunnin soft-ack lánaboð, #49 Tengsl þvert á Teskeiðar  
**Tengist:** `2026-06-22-2242-todo-043-049-v005-codex-gmail-canonical-tengsl-handoff.md`  
**Dagsetning:** 2026-06-22 23:11  
**Frá:** Codex  
**Til:** Claude Code  
**Staða:** Stebbi bað Codex að búa til handoff til Claude Code sem rýnir og breytir eftir þörfum.

## Verkefni fyrir Claude Code

Rýna `sql/56_normalize_email_canonical.sql` eins og production migration og laga það sem þarf áður en Stebbi keyrir SQL í Supabase.

Claude Code má breyta:

- `sql/56_normalize_email_canonical.sql`
- tengdum static SQL tests, líklega `lib/__tests__/sql-migration.test.ts`
- tengdum email-normalization tests ef TypeScript/SQL parity þarf að festa betur
- handoff/done skrá eftir framkvæmd

Claude Code á ekki að keyra SQL í Supabase eða gera production backfill án skýrs samþykkis Stebba.

## Review findings frá Codex

### High: Nullable email-samanburður getur fallið opið

Í núverandi `sql/56_normalize_email_canonical.sql` eru auth/email checks með `!=`.

Dæmi:

- `claim_loan_invitation`: `IF public.normalize_email_canonical(v_actor_email) != public.normalize_email_canonical(v_inv.recipient_email_normalized) THEN`
- `decline_invitation`: sams konar `!=`

Í PL/pgSQL verður `NULL != 'x'` að `NULL`, ekki `true`. `IF NULL THEN` keyrir ekki. Ef `auth.users.email` er óvænt `NULL`, eða helper skilar `NULL`, gæti checkið ekki stoppað rétt.

Krafa:

- Reikna `v_actor_norm` og `v_inv_recipient_norm` í breytur þar sem við á.
- Ef actor canonical email er `NULL`, skila öruggri villu:
  - `claim_loan_invitation`: líklega `wrong_email` eða `unauthenticated`, en velja samræmt og skrá ákvörðun.
  - `decline_invitation`: líklega `not_found`, eins og núverandi unauthorized boundary.
- Nota `IS DISTINCT FROM` frekar en `!=` fyrir security-boundary.

Dæmi að mynstri:

```sql
v_actor_norm := public.normalize_email_canonical(v_actor_email);
v_recipient_norm := public.normalize_email_canonical(v_inv.recipient_email_normalized);

IF v_actor_norm IS NULL OR v_actor_norm IS DISTINCT FROM v_recipient_norm THEN
  RETURN 'wrong_email';
END IF;
```

Ekki copy/paste-a dæmið óhugsandi; staðfæra status-kóða eftir function.

### Medium: Preflight kaflinn er ekki raunverulegt "before applying" preflight

Neðst í `sql/56_normalize_email_canonical.sql` er "Optional read-only preflight (run before applying)", en preflight notar `public.normalize_email_canonical()` sem er ekki til fyrr en migration hefur verið keyrð.

Krafa:

- Annaðhvort breyta textanum í "run after helper has been created" og útskýra röðina.
- Eða búa til standalone read-only preflight sem notar inline expression og getur keyrt áður en migration er keyrð.
- Ef preflight er áfram í sömu skrá eftir `COMMIT`, passa að Stebbi skilji að það er ekki hluti af migration og er read-only.

Codex mælir með að hafa sér kommentaðan "standalone preflight" með inline canonical expression eða færa preflight í sérstaka handoff/SQL-preflight skrá ef það verður umfangsmikið.

### Medium: SQL helper canonicalize-ar en validar ekki input

`public.normalize_email_canonical(text)` skilar `lower(trim(p_email))` fyrir nánast allt non-Gmail input, jafnvel ef það er ekki gilt netfang.

Þetta gæti verið ásættanlegt ef caller validar alltaf input áður en skrifað er, en sem canonical identity helper er öruggara að skrá ákvörðunina skýrt.

Claude Code á að velja annað af tveimur:

1. Halda helpernum sem canonicalizer, ekki validator, og bæta comment/test sem segir það skýrt.
2. Láta helper skila `NULL` fyrir augljóslega ógilt input, í takt við TypeScript `normalizeEmailForAccess()`.

Ef valið er #2, þarf að rýna öll köll svo `NULL` valdi ekki opnu auth-checki eða óvæntri insertion hegðun.

Codex hallast að #2 ef það er hægt án mikils scope, en #1 er ásættanlegt ef callers eru stranglega varðir og tests festa hegðunina.

### Medium: `get_my_pending_invitations` heldur áfram expiry-filter

`get_my_pending_invitations` heldur `AND inv.expires_at > now()`.

Soft-ack ákvörðunin í `get_my_loans` er að pending boð eigi að sjást eftir email-link expiry. Það er mögulega í lagi ef `get_my_pending_invitations` er legacy/email-claim helper, en það þarf að staðfesta.

Krafa:

- Claude Code þarf að leita í appkóða hvort `get_my_pending_invitations` er enn notað í núverandi UI.
- Ef það er notað fyrir soft-ack/lista þarf að samræma expiry-hegðun.
- Ef það er legacy, bæta comment í migration eða tests sem skýrir að þessi function er ekki canonical soft-ack listinn.

Ekki breyta expiry-hegðun án þess að staðfesta notkun og product-áhrif.

### Low: `auth_mvp_allowlist` comment virðist ruglandi

Header segir að allowlist check noti `normalize_email_canonical(email) = v_actor_norm`, en migration virðist ekki uppfæra allowlist function eða check. Í nýrri `create_loan` virðist allowlist-check ekki lengur vera hluti af function.

Krafa:

- Fjarlægja commentið ef það er úrelt.
- Eða breyta því í nákvæma athugasemd um að þessi migration snerti ekki allowlist.

## Atriði sem líta vel út

Codex sá líka jákvæða hluti í núverandi SQL:

- Gmail/Googlemail reglan er afmörkuð við `gmail.com` og `googlemail.com`.
- Punktar eru ekki fjarlægðir á öðrum domainum.
- `+alias` er ekki fjarlægt í v1, sem er rétt án sér product-ákvörðunar.
- Read paths normalisera stored recipient og actor email, þannig eldri dotted Gmail rows geta matchað.
- Migration gerir ekki data cleanup/backfill, sem minnkar production áhættu.

## Auka rýni sem Claude Code þarf að gera

### Function parity

Þetta migration endurskrifar mörg functions. Claude Code þarf að bera þau saman við nýjustu raunverulegu migration bodies:

- `get_my_loans`: bera við `sql/55_get_my_loans_add_recipient_email.sql`
- `claim_loan_invitation`: bera við `sql/50_loan_soft_acknowledgement.sql`
- `create_loan`, `add_loan_invitation`: bera við `sql/49_raise_invitation_rate_limits.sql`
- `get_my_pending_invitations`, `get_invitation_for_claim`, `decline_invitation`: bera við nýjustu gildandi version í repo

Passa sérstaklega að missa ekki:

- soft-ack branch sem sýnir pending boð eftir email expiry í `get_my_loans`
- `recipient_email` output í `get_my_loans`
- rate limits úr #49
- service_role-only grants
- `SET search_path = ''`
- idempotency/advisory lock hegðun
- `attempt_status`/`attempt_number` send retry hegðun þar sem við á

### Relationship/Tengsl áhrif

Þessi SQL canonicalization lagar ekki sjálfkrafa duplicate `relationships` rows. Claude Code þarf að skrá það í handoff:

- hvort `sql/56` leysir aðeins invitation/soft-ack canonicalization
- hvort Tengsl duplicate dedupe er leyst í TypeScript merged view
- hvort data cleanup/backfill bíður sér preflight

Ekki láta Stebba halda að `sql/56` eitt og sér eyði eða sameini existing duplicate rows í `relationships`.

## Próf sem Claude Code á að bæta við eða keyra

Static SQL tests:

- `normalize_email_canonical('fyrri.seinni@gmail.com')` hegðun er fest í SQL texta/test.
- `googlemail.com` canonicalize-ar í `gmail.com`.
- non-Gmail punktar eru ekki fjarlægðir.
- claim/decline nota `IS DISTINCT FROM` eða explicit `NULL` guard, ekki bara `!=`.
- `get_my_loans` branch 2 normaliserar báðar hliðar.
- new write paths geyma canonical recipient email.
- `get_my_loans` heldur `recipient_email` output og soft-ack branch.

TypeScript tests:

- staðfesta parity við `normalizeEmailForAccess()` ef viðeigandi.

Targeted command suggestions:

- `npm run test:run -- lib/__tests__/sql-migration.test.ts`
- `npm run test:run -- lib/__tests__/email-normalization.test.ts`
- `npm run type-check`

Ef Claude Code breytir loan action/types tengt þessu, keyra líka viðeigandi `actions`, `loans` og `tengsl` tests.

## Supabase og production-varúð

`sql/56_normalize_email_canonical.sql`:

- breytir SQL functions
- bætir við helper function
- breytir ekki töflum
- breytir ekki gögnum beint
- getur samt haft production áhrif á auth/claim/list visibility

Áður en Stebbi keyrir þetta í Supabase þarf Claude Code að skila:

- nákvæmri lýsingu á hvað SQL breytir
- hvort migration var aðeins skrifuð eða líka keyrð local
- hvort PostgREST schema cache reload þarf
- hvort rollback er réttur og raunhæfur
- hvort preflight þarf að keyra fyrst
- hvaða tests voru keyrð og exit codes

Ekki keyra production SQL eða Supabase dashboard actions án skýrs samþykkis Stebba.

## Localhost checks for Stebbi

Þegar Claude Code hefur lagað SQL/appkóða og Stebbi hefur keyrt nauðsynlegt SQL í local Supabase eða viðeigandi local DB:

### Gmail punktanetfang í pending lánaboði

1. Notandi A stofnar lánaboð á synthetic dotted Gmail, t.d. `fyrri.seinni@gmail.com`.
2. Notandi B skráir sig inn með canonical/punktalausri útgáfu, t.d. `fyrriseinni@gmail.com`.
3. Opna `Lánað og skilað`.
4. Vænt niðurstaða: pending boðið sést hjá B.
5. Velja `Þekki málið`.
6. Vænt niðurstaða: boðið claimast og verður hluti af lánalistanum, ekki `wrong_email`, `not_found`, `expired` eða `not_claimable`.
7. Endurtaka öfugt: senda á punktalaust og skrá inn með punktuðu.

### Non-Gmail má ekki sameinast

1. Prófa eða staðfesta í testum að `fyrri.seinni@example.com` og `fyrriseinni@example.com` séu ekki sami canonical aðili.
2. Vænt niðurstaða: þau mega ekki claim-a hvort annars boð og mega ekki merge-ast í Tengslum.

### Tengsl

1. Opna `/stillingar/tengsl`.
2. Ef til eru dotted/punktalaus Gmail duplicate tengsl, á UI að sýna eina sameinaða færslu þegar TypeScript/Tengsl fix er komið.
3. Opna sameinaða færslu.
4. Vænt niðurstaða: activity úr báðum eldri netfangsútgáfum sést ef owner má sjá hana.

### Regression

1. Venjuleg lánaboð á non-Gmail netfang virka áfram.
2. Self-invite á dotted/punktalaust sama Gmail skilar áfram `recipient_unavailable`.
3. `Afturkalla boð`, `Endursenda boð`, `Kannast ekki við þetta` og `Þekki málið` virka áfram í grunnflæðum.

Ekki prófa kæruleysislega:

- Ekki nota raunnetföng í test fixtures eða screenshots.
- Ekki keyra production backfill.
- Ekki breyta production duplicate `relationships` rows án sér samþykkis.

## Spurningar fyrir Claude Code í handoff til baka

1. Hvaða findings frá Codex voru staðfest?
2. Hvaða findings voru ekki vandamál og af hverju?
3. Hvernig var nullable email/auth-check lagað?
4. Var SQL helperinn canonicalizer-only eða validator líka?
5. Var `get_my_pending_invitations` expiry-hegðun látin óbreytt? Af hverju?
6. Þarf að keyra preflight áður en Stebbi keyrir migration?
7. Hvað leysir `sql/56` ekki varðandi existing `relationships` duplicates?
8. Hvaða próf voru keyrð og hver voru exit codes?
