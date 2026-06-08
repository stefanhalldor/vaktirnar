# TODO #14 - Corrections to v006 (v008)

**TODO item:** #14 - Öryggisforsendur fyrir opna beta
**Author:** Claude Code
**Date:** 2026-06-08
**Version:** v008
**Addresses:** 2026-06-08-todo-014-v007-codex-open-beta-security-plan-review.md
**Base plan:** 2026-06-08-todo-014-v006-claude-open-beta-security-plan-revised.md

Codex did not request a full plan rewrite. This file records four corrections to v006.
v006 otherwise stands. Implementation can proceed after Stebbi decisions below.

---

## Correction 1 (Medium) - Rate-limit cleanup moves into the RPC

**Problem:** v006 placed `auth_ip_rate_limit` cleanup inside `createUserCode()`. But
rate-limited and non-allowlisted requests never reach `createUserCode()`, so the table
can grow indefinitely under the exact abuse pattern it is meant to stop.

**Fix:** Cleanup runs inside `check_and_increment_ip_rate_limit()` in sql/42, after the
upsert. One bounded DELETE per call, scoped only to this table. No new cron needed.

**Corrected sql/42 RPC body (replaces v006 sketch):**

```sql
CREATE OR REPLACE FUNCTION public.check_and_increment_ip_rate_limit(
  p_key_hash     text,
  p_window_start timestamptz,
  p_max_requests int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  -- Upsert: insert or increment request counter for this IP+window.
  INSERT INTO public.auth_ip_rate_limit (key_hash, window_bucket, request_count)
  VALUES (p_key_hash, p_window_start, 1)
  ON CONFLICT (key_hash, window_bucket)
  DO UPDATE SET request_count = auth_ip_rate_limit.request_count + 1
  RETURNING request_count INTO v_count;

  -- Bounded cleanup: delete rows older than 1 hour. One DELETE per call.
  -- Scoped only to auth_ip_rate_limit. Keeps table bounded under abuse load.
  DELETE FROM public.auth_ip_rate_limit
  WHERE created_at < now() - interval '1 hour';

  RETURN v_count <= p_max_requests;
EXCEPTION WHEN OTHERS THEN
  RETURN false;  -- fail closed on any error
END;
$$;
```

`createUserCode()` cleanup is NOT changed to include `auth_ip_rate_limit`.

---

## Correction 2 (Medium) - `checkFeatureAccess()` explicit fail-closed contract

**Problem:** v006 said "never throws, never redirects" but did not specify that
`isAuthMvpAllowedEmail()` or `getAdmin()` errors must be caught.

**Fix:** `checkFeatureAccess()` wraps the allowlist lookup in try/catch. Any error
returns `false`. Log uses static string only - no userId, no email.

**Corrected implementation contract:**

```typescript
export async function checkFeatureAccess(
  userId: string,
  email: string,
  featureKey: string
): Promise<boolean> {
  // Unknown feature keys fail closed. Prevents accidental allow-by-default.
  if (featureKey !== 'lanad-og-skilad') {
    return false
  }

  if (process.env.LOANS_ENABLED !== 'true') {
    return false
  }

  try {
    return await isAuthMvpAllowedEmail(email.toLowerCase().trim())
  } catch {
    console.error('[feature-access] allowlist lookup failed')
    return false  // fail closed
  }
}
```

**Additional tests (add to 14C test suite):**
- `checkFeatureAccess()` returns `false` when `isAuthMvpAllowedEmail()` throws.
- `/heim` with valid session and failed feature lookup does not call loan RPCs.
- No email or userId appears in `checkFeatureAccess` log output.
- `checkFeatureAccess(userId, email, 'unknown-feature')` returns `false`.

---

## Correction 3 (Low) - Unknown IP bucket uses same limit, not more generous

**Problem:** v006 prose said "same per-window limit" but code sketch used
`UNKNOWN_MAX = 20` vs `MAX_REQUESTS = 10`. Unidentifiable traffic is less
trustworthy, not more.

**Fix:** Use the same limit for `unknown` as for identified IPs:

```typescript
const MAX_REQUESTS = 10
// unknown bucket: same limit, not UNKNOWN_MAX = 20
const max = MAX_REQUESTS  // regardless of whether IP is 'unknown'
```

If Stebbi wants a stricter limit for `unknown`, it can be set lower (e.g. 5). It
must not be set higher.

---

## Correction 4 (Low) - Optional chaining fallback uses index, not `'unknown'`

**Problem:** v006 suggested `key={row.parent?.id ?? 'unknown'}` in the map. If
multiple parents have null profiles, React gets duplicate keys.

**Fix (Path A only):**

```tsx
{parents.map((row: any, idx: number) => (
  <div key={row.parent?.id ?? `fallback-${idx}`} ...>
    <Avatar name={row.parent?.display_name || '?'} size="sm" />
    <p>{row.parent?.display_name || '-'}</p>
  </div>
))}
```

---

## Summary of all v006 decisions confirmed by Codex (v007)

| Topic | Codex position |
|-------|---------------|
| 14.3 required | Confirmed |
| `/heim` real feature check | Confirmed |
| `minn-profill` layout guard | Confirmed |
| `/api/teskeid/profile` stays in PUBLIC_PATHS | Confirmed |
| 14A Path A acceptable | Comfortable, with defensive optional chaining |
| Option B (Supabase) for rate-limit | Still preferred |
| AUTH_CODE_SECRET reuse | Acceptable for beta, must be explicit |
| Phase order 14A, 14C, 14B, 14D | Accepted |

---

## Decisions Stebbi must make before implementation starts

Codex says Phase 14A can start as soon as Stebbi answers question 1.
Questions 2 and 3 are needed before 14B starts.

**1. Phase 14A - Path A or B?**
- Path A (recommended by Claude Code and acceptable to Codex): tighten
  `profiles_select` + add defensive optional chaining to legacy page.
  `LEGACY_ENABLED=false` in production. Co-parent names disappear if legacy is
  ever turned on, but the page does not crash.
- Path B: add narrow RPC for co-parent names first (more work).

**2. Phase 14B - Upstash or Supabase table?**
- Option A (Upstash): no SQL, external dependency, two new env vars.
- Option B (Supabase table, sql/42): Codex preference, no external dependency,
  one extra DB roundtrip per request-code call.

**3. Phase 14B - AUTH_CODE_SECRET reuse?**
- Accepted: rotating AUTH_CODE_SECRET resets IP rate-limit buckets (minor side
  effect for a rare operation). No separate `RATE_LIMIT_SECRET` needed.
- Not accepted: Claude Code adds `RATE_LIMIT_SECRET` env var.

Codex recommends accepting reuse. Claude Code agrees.

**Phase order:** 14A, 14C, 14B, 14D unless Stebbi says otherwise.
