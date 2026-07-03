# TODO #67 Vedrid - Admin-controlled map provider toggle addendum

Created: 2026-07-03 15:08
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Planning addendum. No code, SQL, env, dependency, Supabase, commit, push, deploy, or production changes made.

## Stebbi direction

Stebbi wants admin control over whether Vedrid uses Google Maps Platform or Mapbox.

Codex agrees. This is better than exposing provider choice to normal users.

## Recommendation

Add an **admin-only provider setting** for the experiment and future fallback:

- `google`
- `mapbox`
- optionally `disabled` / `provider_unavailable` for emergency shutdown

Do not make normal users choose between Google and Mapbox. Normal users should only confirm whether the shown place/route looks right.

## Why admin setting is the right shape

Admin control gives Stebbi:

- a way to compare providers without redeploying;
- an emergency switch if one provider breaks or billing looks risky;
- a clean beta experiment path;
- a stable product experience for normal users.

It also keeps provider strategy out of user-facing copy.

## Important implementation boundary

This should not be treated as a tiny client-side dropdown.

If the setting is persisted and editable in admin, it likely needs:

- server-side read path;
- admin-only write path;
- storage in an existing settings/config pattern, or a new small config table;
- audit fields such as `updated_by`, `updated_at`;
- RLS/admin guard review if Supabase storage is used;
- no exposure of provider secret keys.

That means admin provider toggle implementation needs its own scoped execution permission if/when Stebbi wants it built.

## Suggested rollout shape

### First implementation

For the immediate provider bake-off:

- env/default provider is acceptable for local/dev planning;
- admin UI can be planned but does not need to block the first internal comparison;
- Claude Code should identify whether the repo already has an admin settings/config pattern.

### Admin UI later in the experiment

Add a small admin setting:

```text
Veðurkort provider
[Google Maps] [Mapbox]
```

Show provider health/config state:

- Google configured / missing keys
- Mapbox configured / missing keys
- budget/quotas are external and should be checked in provider dashboard

Do not allow selecting a provider whose required keys are missing.

### Normal user UI

User sees:

- place/route confirmation;
- feedback controls;
- provider attribution where required by the map provider.

User does not see:

- provider toggle;
- provider experiment language, except a light beta note if Stebbi wants it.

## Provider selection semantics

The selected provider should apply consistently within a single flow.

Do not:

- start place search with Google and route with Mapbox in the same flow;
- switch provider mid-flow after confirmation;
- silently fall back to another provider and still present the result as if it came from the selected provider.

If fallback is added later, the answer should say that the primary provider was unavailable and the result is from fallback. That is later work, not MVP.

## Config and caching notes

- Provider setting should be read server-side for route/geocoding decisions.
- Client map/search UI should load only the assets/key needed for the selected provider where feasible.
- If both provider browser keys are present, still keep secret/server keys server-only.
- Do not persist provider-derived coordinates globally, regardless of selected provider.

## Relationship to v031

v031 remains the main provider-experiment plan.

v032 adds one product requirement:

> Provider choice should be controlled by admin, not exposed to normal users.

Claude Code should fold this into the next revised plan.

## Localhost checks for Stebbi

This addendum has no localhost checks because it changes no app code.

For eventual implementation:

1. Admin can see active provider.
2. Admin can switch provider if both providers are configured.
3. Non-admin cannot see or change provider setting.
4. Normal user route/golf flow does not expose provider choice.
5. Selected provider stays stable throughout one route/golf confirmation flow.
6. Missing provider keys make the provider unavailable in admin UI, not crash the user flow.
7. No provider secret key appears in browser/devtools.

## Suggested message to Claude Code

Add v032 to the current direction: Stebbi wants admin control over whether Vedrid uses Google Maps Platform or Mapbox.

Do not expose this choice to normal users. Normal users should only confirm whether the shown place/route is correct.

Please fold an admin-only provider setting into the next plan, but do not implement it casually. If it requires persistence, admin actions, SQL/RLS, or config storage, it needs explicit scoped execution permission and a small security review.
