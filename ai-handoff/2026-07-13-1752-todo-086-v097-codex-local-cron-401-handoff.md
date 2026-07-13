# TODO 086 - Local cron 401 troubleshooting handoff

Created: 2026-07-13 17:52  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Context: Follow-up after `2026-07-13-1727-todo-086-v096-codex-v095-cron-auth-review.md`

## Summary

Stebbi tested the new local cron endpoint for Veðurstofan warming:

`GET http://localhost:3004/api/cron/warm-vedurstofan`

The request still returns `401 Unauthorized` even when the `Authorization: Bearer <CRON_SECRET>` header is built from `.env.local`.

Codex reviewed the relevant code paths and the most likely cause is now clear: the request is probably being rejected by `middleware.ts` before it reaches `app/api/cron/warm-vedurstofan/route.ts`.

## What Stebbi tested

Stebbi has a local `.env.local` containing `CRON_SECRET`. The actual value has appeared in chat/screenshots and must not be reused for production/Vercel.

Stebbi confirmed there is exactly one `CRON_SECRET` line in `.env.local`:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar; Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Measure-Object
```

Result:

```text
Count: 1
```

Stebbi confirmed the value can be read from `.env.local` and has length 44:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar; $secret = ((Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -Last 1).Line -replace '^CRON_SECRET=', '').Trim(); $secret.Length
```

Result:

```text
44
```

Stebbi then called the endpoint with the value read from `.env.local`:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar; $secret=((Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -Last 1).Line -replace '^CRON_SECRET=','').Trim(); $headers=@{Authorization="Bearer $secret"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

Observed result:

```text
Invoke-RestMethod : The remote server returned an error: (401) Unauthorized.
```

Stebbi also restarted the dev server. The server showed:

```text
Next.js 15.5.14
Local: http://localhost:3004
Environments: .env.local
Ready
Compiled /middleware
```

Important clue: the server output mentioned middleware compilation, but Stebbi did not report seeing route compilation/output for `/api/cron/warm-vedurstofan`.

## What Codex checked

Codex read:

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `app/api/cron/warm-vedurstofan/route.ts`
- `middleware.ts`

Codex did not read or expose `.env.local`.

Relevant route handler in `app/api/cron/warm-vedurstofan/route.ts`:

```ts
const cronSecret = process.env.CRON_SECRET
const authHeader = request.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

This route-level auth is correct in principle: fail closed if `CRON_SECRET` is missing, and require exact bearer token match.

Relevant middleware behavior:

- `PUBLIC_PATHS` includes several public API prefixes.
- `PUBLIC_PATHS` does not include `/api/cron/warm-vedurstofan`.
- If a request is unauthenticated and not public, middleware returns:

```ts
if (!user && !isPublic && !isAuthCallback) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  ...
}
```

Therefore a no-cookie `Invoke-RestMethod` call to `/api/cron/warm-vedurstofan` can receive `401 Unauthorized` from middleware before the route handler ever gets to compare `CRON_SECRET`.

## Diagnosis

The current evidence points to middleware preempting the cron request.

This explains why:

- Reading the secret from `.env.local` works.
- There is only one `CRON_SECRET` line.
- Restarting the server did not fix it.
- The server output highlights `/middleware`.
- The response is still a generic 401.

Earlier hypotheses about stale PowerShell env vars or base64 formatting are now less likely, though still possible if the middleware fix does not resolve the issue.

## Required hotfix

Add `/api/cron/warm-vedurstofan` to `PUBLIC_PATHS` in `middleware.ts`.

Rationale:

- The endpoint should not require a Supabase user session or browser auth cookie.
- It is not public in the product sense because the route handler enforces `CRON_SECRET`.
- This should match the existing comment pattern for routes where "handlers enforce their own flag and auth checks".

Important: do not make all `/api/cron/*` public unless deliberately reviewed. A narrow path is safer.

## Suggested copy/paste for Claude Code

```text
Claude Code, framkvæmdu afmarkað hotfix fyrir TODO 086 cron auth.

Vandamálið sem Stebbi og Codex staðfestu í local prófunum:
- GET http://localhost:3004/api/cron/warm-vedurstofan skilar 401 Unauthorized.
- Stebbi staðfesti að .env.local inniheldur nákvæmlega eina CRON_SECRET línu.
- Stebbi staðfesti að PowerShell les secret úr .env.local og lengdin er 44.
- Kallið notar Authorization: Bearer <secret> byggt úr .env.local.
- Dev serverinn sýndi Compiled /middleware, en route virðist líklega ekki komast í gang.

Codex skoðaði kóðann og líkleg orsök er að middleware.ts stoppar no-cookie API request áður en app/api/cron/warm-vedurstofan/route.ts fær kallið.

Gerðu þetta:
1. Bættu nákvæmlega /api/cron/warm-vedurstofan í PUBLIC_PATHS í middleware.ts.
2. Haltu route-level CRON_SECRET auth óbreyttu í app/api/cron/warm-vedurstofan/route.ts.
3. Ekki gera /api/cron/* allt public nema þú rökstyðjir það sérstaklega og stoppar fyrir review.
4. Ekki breyta Supabase, migrations, .env.local, secrets, commit, push eða deploy.
5. Keyrðu viðeigandi targeted tests ef til eru fyrir cron/middleware auth; annars keyrðu type-check og segðu nákvæmlega hvað var prófað.

Eftir breytingu á Stebbi að endurræsa dev serverinn og prófa sama PowerShell kall aftur.
```

## Security notes

- The local `CRON_SECRET` value has appeared in chat/screenshots during troubleshooting.
- Do not reuse that value in Vercel or production.
- Generate a fresh production `CRON_SECRET` before setting it in Vercel environment variables.
- Do not log the secret.
- Do not echo the secret in future handoff files or terminal screenshots.

## Localhost checks for Stebbi

After Claude Code applies the middleware hotfix:

1. Restart the local dev server manually:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar
npx next dev -p 3004
```

2. In a second PowerShell terminal, call the cron endpoint with the secret read from `.env.local`:

```powershell
cd C:\Users\Lenovo\Documents\vaktirnar; $secret=((Select-String -Path .env.local -Pattern '^CRON_SECRET=' | Select-Object -Last 1).Line -replace '^CRON_SECRET=','').Trim(); $headers=@{Authorization="Bearer $secret"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

3. Expected auth result:

- Not `401 Unauthorized`.
- If `WEATHER_ENABLED` is not `true`, expected response is a skipped/weather-disabled JSON response.
- If `WEATHER_ENABLED=true` and Supabase/service-role config is present, the endpoint may actually warm Veðurstofan cache/product data. Treat that as a real data-writing operation.

4. Negative auth check:

```powershell
$headers=@{Authorization="Bearer definitely-wrong"}; Invoke-RestMethod -Uri "http://localhost:3004/api/cron/warm-vedurstofan" -Headers $headers
```

Expected result:

```text
401 Unauthorized
```

5. Do not casually test this against production. Production cron invocation and Vercel env setup require explicit approval.

## Risks / open questions

- Middleware has no explicit test shown here. Claude Code should add or update a focused test if the existing test setup supports middleware auth behavior.
- If adding the path to `PUBLIC_PATHS` still results in 401, the next likely suspects are stale process env, an OS-level `CRON_SECRET` overriding `.env.local`, or a mismatch between the local server process and the repo path being tested.
- This handoff does not approve commit, push, deploy, Supabase changes, migration execution, or production cron invocation.
