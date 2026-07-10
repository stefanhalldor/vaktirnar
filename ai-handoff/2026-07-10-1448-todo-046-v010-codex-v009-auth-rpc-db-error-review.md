# Codex review: TODO #46 v009 auth RPC DB error

Created: 2026-07-10 14:48
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, v009 prerelease handoff

## Staða

Stebbi prófaði `/innskraning` eftir v009 og fékk 500 þegar kóði var beðinn um:

```text
[user-codes] rpc create_user_otp_code_if_allowed failed
[auth-mvp/request-code] code creation failed (DB error)
[auth-mvp/request-code] {"result":"db_error","ipRateLimitMs":243,"createCodeMs":188,"totalMs":434}
POST /api/auth-mvp/request-code 500
```

Þetta er ekki email-delivery vandamál. Requestið deyr áður en
`sendUserLoginCode()` er kallað.

Engar kóðabreytingar voru gerðar í þessari Codex-rýni.

## Findings

### P0 - Login er brotið ef app-kóðinn er keyrður án SQL 72 í sama gagnagrunni

`lib/auth/user-codes.ts` kallar:

```ts
getAdmin().rpc('create_user_otp_code_if_allowed', ...)
```

Sú function er skilgreind í `sql/72_auth_email_code_request_idempotency.sql`.
Í sömu migration stendur skýrt að hún þarf að keyra áður en uppfærður
TypeScript-kóði er deployaður, annars verður nákvæmlega þessi villa:

- RPC vantar eða er ekki callable
- `createUserCode()` fær RPC error
- `createUserCode()` skilar `null`
- `/api/auth-mvp/request-code` skilar 500
- notandi sér "Eitthvað fór úrskeiðis. Reyndu aftur."

Claude v002 handoff flaggaði þessu líka sem skyldu:

> SQL migration 72 þarf að keyra ÁÐUR EN kóðinn er deployaður.

### P0 - v009 má ekki fara í release með auth-kóðanum nema SQL 72 sé komin inn

v009 handoff segir undir "Hvað á eftir":

- SQL 72 + auth v001 deploy (aðskilið release)

En núverandi working tree virðist innihalda app-kóða sem þegar krefst SQL 72.
Það þýðir að þetta er ekki lengur aðskilið í keyrslu: ef þessi kóði er keyrður
án SQL 72, þá brotnar innskráning.

Öruggir valkostir:

1. Keyra/staðfesta SQL 72 í sama Supabase project og `.env.local` vísar í,
   áður en þessi app-kóði er prófaður eða deployaður.
2. Eða halda auth-idempotency app-kóðanum utan við þessa public weather/umönnun
   útgáfu þar til SQL 72 er tilbúin.

Codex mælir frekar með valkosti 1 ef Stebbi vill halda auth-fixinu inni, því
SQL 72 er skrifuð sem idempotent `CREATE OR REPLACE FUNCTION` og breytir ekki
núverandi gögnum beint. En þetta er samt gagnagrunnsbreyting og þarf skýrt
leyfi/staðfestingu frá Stebba áður en hún er keyrð.

### P1 - Ef SQL 72 er þegar keyrð, vantar betri sanitized DB diagnosis

Ef preflight sýnir að function er til, þarf næsta skref að vera að ná
sanitized PostgREST/Supabase RPC error án þess að logga email, OTP hash,
AUTH_CODE_SECRET eða service-role key.

Núverandi log segir aðeins:

```text
[user-codes] rpc create_user_otp_code_if_allowed failed
```

Það er gott privacy-wise en ekki nóg til að greina hvort vandinn sé:

- function vantar
- signature mismatch
- execute grant vantar
- table grant vantar
- runtime villa inni í function

Claude Code má bæta tímabundið við sanitized loggi á `error.code` og
generic `error.message` ef það inniheldur ekki user input/secrets. Ekki logga
RPC args.

## Read-only SQL preflight fyrir Stebba

Áður en SQL 72 er keyrð er hægt að staðfesta stöðuna með read-only SQL í
Supabase SQL Editor:

```sql
select exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_user_otp_code_if_allowed'
) as has_create_user_otp_code_if_allowed;
```

Vænt:

- `false` þýðir að vandi Stebba er nær örugglega að SQL 72 er ekki keyrð í
  target DB.
- `true` þýðir að function er til og þá þarf að skoða grants/signature/runtime
  með næsta preflight.

Næsta read-only check ef function er til:

```sql
select
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_user_otp_code_if_allowed';
```

Vænt:

- `args` inniheldur `p_email text, p_code_hash text, p_expires_at timestamp with time zone, p_dedupe_secs integer, p_max_per_hour integer`
- `service_role_execute = true`

## Plan fyrir Claude Code

1. Staðfesta hvort SQL 72 hafi verið keyrð í sama Supabase project og
   `.env.local` notar.
2. Ef ekki:
   - segja Stebba að v009 login prófun geti ekki gengið fyrr en SQL 72 er komin
     inn eða auth-kóðabreytingin rollbackuð.
   - ekki reyna að laga þetta með UI breytingu.
3. Ef Stebbi samþykkir SQL keyrslu:
   - keyra `sql/72_auth_email_code_request_idempotency.sql` í target DB.
   - staðfesta að migration skili success.
   - prófa `/innskraning` aftur.
4. Ef SQL 72 er þegar til staðar en villan heldur áfram:
   - bæta sanitized RPC error diagnosis við logs eða keyra read-only function
     privilege checks.
   - ekki logga email, code hash, plaintext OTP, AUTH_CODE_SECRET, service-role
     key eða request body.

## Localhost checks for Stebbi

Áður en prófað er aftur:

1. Staðfesta með read-only SQL hvort `create_user_otp_code_if_allowed` sé til.
2. Ef hún vantar, keyra ekki fleiri login-prófanir fyrr en SQL 72 er komin inn
   eða app-kóðinn hefur verið færður aftur í gamla flæðið.

Eftir að SQL 72 hefur verið keyrð í rétta DB:

1. Opna `/innskraning`.
2. Slá inn leyfilegt netfang.
3. Vænt í terminal:
   - ekki lengur `rpc create_user_otp_code_if_allowed failed`
   - annaðhvort `created_and_sent` eða, ef nýlegur virkur kóði er til,
     `recent_active_suppressed`
4. Vænt í UI:
   - notandi fer á kóða-skref eða fær eðlilega rate-limit stöðu, ekki 500 villu.
5. Ekki smella endurtekið á "Áfram" til að prófa hraða fyrr en búið er að
   staðfesta fyrsta success, því nýja dedupe-flæðið á viljandi að bæla nýja
   kóða í stuttan tíma.

## Skipanir keyrðar af Codex

Read-only:

- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-10-1445-todo-046-v009-claude-v008-done-prerelease.md'`
- `Get-Content -Encoding UTF8 'app/api/auth-mvp/request-code/route.ts'`
- `Get-Content -Encoding UTF8 'lib/auth/user-codes.ts'`
- `rg -n "create_user_otp_code_if_allowed|auth_email_codes|user_otp" sql app lib ai-handoff --glob '!node_modules'`
- `Get-Content -Encoding UTF8 'sql/72_auth_email_code_request_idempotency.sql'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-10-1328-todo-046-v002-claude-v001-done-prerelease.md'`
- `Get-Content -Encoding UTF8 'sql/27_auth_email_codes.sql'`
- `Get-Content -Encoding UTF8 'lib/supabase/admin.ts'`

## Áhætta / þarf að staðfesta

- Þarf að staðfesta hvort SQL 72 sé þegar keyrð í target DB. Codex hefur ekki
  keyrt SQL og á ekki að keyra migration án skýrs leyfis.
- Ef `.env.local` vísar í production Supabase þarf Stebbi að meðhöndla SQL 72
  sem production DB breytingu, þó migration-in sé idempotent og breyti ekki
  núverandi gögnum beint.
- Ekki deploya v009/v010 kóðann með auth-idempotency breytingunni nema SQL 72 sé
  komin inn í sama database.
