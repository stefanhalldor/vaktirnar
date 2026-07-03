# TODO #67 (proposed) - Codex v001 - Vedrid AI-first handoff

Created: 2026-07-03 00:00  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: Handoff for Claude Code. No code, SQL, env, Supabase, commit, push, deploy, or production changes were made.

## Scope

This file is a planning handoff for the new Teskeid feature **Vedrid**.

Source material:

- Stebbi's attachment: `C:\Users\Lenovo\.codex\attachments\ec4e87b7-208b-4486-b8d2-4b7f7db0a225\pasted-text.txt`
- `Design.md`
- `WORKFLOW.md`
- `ai-handoff/README.md`
- Current repo feature-flag patterns in `.env.example`, `lib/loans/guard.ts`, `app/auth-mvp/heim/page.tsx`, and `components/teskeid/ReadyTeskeidCard.tsx`
- Official met.no references to verify during implementation:
  - https://api.met.no/weatherapi/locationforecast/2.0/documentation
  - https://api.met.no/doc/TermsOfService

`TODO.md` has not been updated in this handoff. Filename uses proposed TODO #67 because the weather feature is not currently registered as an open TODO item.

## Important Product Decision From Stebbi

Stebbi does **not** want an AI-less MVP.

The attachment says "Fyrsta taekniverkefni er AI-laust", but Stebbi has now overridden that product direction:

- Phase 1 must include the AI answer layer, because the feature is not useful enough as a real product without it.
- The UI should be built in its intended final shape from the start, not as a temporary technical demo.
- AI must still sit behind a flag so it can be hidden if it is too expensive, unstable, or produces weak answers.
- Deterministic weather/tool results remain the source of truth and must always be available as fallback.

So the correct product model is:

- `WEATHER_ENABLED` controls whether Vedrid exists in the app.
- `WEATHER_FLAG` should follow the existing optional per-user gate pattern if Stebbi wants selected-user rollout before open release.
- `WEATHER_AI_ENABLED` controls only the AI answer layer.
- The feature still works with `WEATHER_AI_ENABLED=false`, but the first real implementation should be designed around showing the AI answer when the flag is on.

## Core Concept

Vedrid is not a normal weather forecast.

It answers:

> Hvad a eg ad gera?

Product principle:

> Textareitur inn, teskeid ut.

User writes a natural-language question. Teskeid returns one short, useful, action-oriented answer.

Examples:

- "Hvenaer er sidasti sjens ad fara heim fra Selfossi med hjolhysi?"
- "Er betra ad spila golf i Grafarholti kl. 10 eda 14?"
- "Er grillvedur i Moso i kvold?"
- "Get eg malad pallinn a morgun?"
- "Hvenaer er best ad hengja ut tvott?"

Default output should not be a table, graph, generic forecast, or long explanation. The main answer is one clear recommendation. Facts, thresholds, reason codes, and tool traces can live behind "Af hverju?" or dev/debug mode.

## Non-Negotiable Safety Rules

Deterministic code decides weather status and thresholds. AI only interprets, selects tools, and words the final answer.

AI must never:

- invent thresholds
- decide safety status from prompt text alone
- ignore deterministic status
- create weather facts or numbers
- say something is safe when deterministic tools say caution/red
- answer without a valid deterministic `toolResultId`

AI answer is invalid unless:

- it references a real deterministic `toolResultId`
- the tool result exists in the same request
- the AI wording does not contradict deterministic status, reason code, facts, or suggested action
- unsafe wording is absent

Forbidden or high-risk wording in user-facing answers:

- "oruggt"
- "tryggt"
- "engin haetta"
- "thu matt alveg fara"
- "safe"

Prefer:

- "ekki maelt med"
- "biddu frekar"
- "farðu varlega"
- "betri gluggi eftir..."
- "eg myndi ekki leggja af stad nuna"
- "thetta litur illa ut fyrir hjolhysi"

## Existing Repo Context

Observed current state:

- There is no existing weather implementation.
- `messages/is.json` and `messages/en.json` already contain future-idea labels for Vedrid / Weather.
- `.env.example` currently has feature-flag examples for `LOANS_ENABLED`, `UMONNUN_ENABLED`, `TENGSL_ENABLED`, and `FACEBOOK_OAUTH_ENABLED`.
- `lib/loans/guard.ts` already has a two-level feature gate pattern:
  - `{FEATURE}_ENABLED=true` is the global kill switch.
  - `{FEATURE}_FLAG=true` enables per-user access via `feature_access`.
  - If `{FEATURE}_FLAG` is unset or false, all logged-in users get access when `{FEATURE}_ENABLED=true`.
- `app/auth-mvp/heim/page.tsx` maps launched ideas to routes in `READY_TESKEID_ROUTES`.
- `components/teskeid/ReadyTeskeidCard.tsx` maps feature slugs/categories to Lucide icons.
- `package.json` should be checked before implementation. Do not assume an Anthropic SDK exists. If adding a dependency, Claude Code must ask Stebbi explicitly first.

Recommendation:

- Reuse the established `checkFeatureAccess` pattern for Vedrid if this becomes a visible launched Teskeid.
- Do not invent a second gating system.
- Keep AI cost/quality control separate from app access:
  - `WEATHER_ENABLED` / `WEATHER_FLAG`: who can see/use Vedrid.
  - `WEATHER_AI_ENABLED`: whether AI wording is used.

## Proposed Env / Config

Add only during an approved implementation phase, not during read-only review:

```env
WEATHER_ENABLED=
# WEATHER_FLAG=true  # optional per-user rollout via feature_access when WEATHER_ENABLED=true

WEATHER_AI_ENABLED=false
WEATHER_AGENT_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=

METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; hallo@teskeid.is)
```

Notes:

- `ANTHROPIC_API_KEY` must be server-only. Never expose it to the browser or `NEXT_PUBLIC_*`.
- `WEATHER_AGENT_MODEL` must be config, not hardcoded business logic.
- `METNO_USER_AGENT` must be a real identifying app/contact string. Claude Code should confirm exact domain/email with Stebbi before production.
- Do not add geocoding/directions API keys until the provider choice is explicitly approved.

## Architecture

Use one weather agent plus deterministic tools. Do not create one agent per activity.

Suggested modules after implementation approval:

- `lib/weather/types.ts`
- `lib/weather/thresholds.ts`
- `lib/weather/metno.server.ts`
- `lib/weather/forecast.ts`
- `lib/weather/places.ts`
- `lib/weather/route.ts`
- `lib/weather/tools.ts`
- `lib/weather/ai.server.ts`
- `app/api/teskeid/weather/ask/route.ts` or a server action, after Claude Code evaluates local patterns
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/loading.tsx`
- focused tests under existing test conventions

Core result shape:

```ts
type WeatherAnswerEnvelope = {
  deterministic: {
    id: string;
    source: 'deterministic';
    toolName: string;
    createdAt: string;
    svar: string;
    stada: 'graent' | 'gult' | 'rautt';
    reasonCode?: string;
    facts?: string[];
    suggestedAction?: string;
    timeWindow?: { from?: string; to?: string };
  };
  ai?: {
    svar: string;
    adgerd?: string;
    toolResultId: string;
  };
  displayed: {
    source: 'ai' | 'deterministic';
    svar: string;
  };
};
```

Display rule:

- If `WEATHER_AI_ENABLED=false`: show deterministic answer.
- If `WEATHER_AI_ENABLED=true` and AI is valid: show AI answer.
- If AI errors, times out, lacks valid `toolResultId`, or contradicts deterministic data: show deterministic answer.
- In dev/debug, show both answers and facts for evaluation.

## Deterministic Tools

Start with the tools in the attachment, but keep implementation sliced:

### `resolvePlace(name)`

Resolves user wording to coordinates and formal names.

Important:

- "Moso" -> Mosfellsbaer
- "Grafarholtid" -> Grafarholtsvollur / relevant golf place
- Needs provider decision before production-quality geocoding.
- Do not choose a paid provider or add keys without Stebbi approval.

### `forecast(lat, lon, windowHours)`

Fetches met.no Locationforecast and normalizes to internal `HourPoint[]`.

Fields from attachment:

- `air_temperature`
- `wind_speed`
- `wind_speed_of_gust`
- `wind_from_direction`
- `precipitation_amount`
- `symbol_code`

### `activityWindow(activity, hours)`

Shared deterministic helper for grill, laundry, painting, and simple place decisions.

Phase 1 should at minimum handle grill in Moso well enough to prove the pattern.

### `golfPlayable(hours)`

Finds a 4.5 hour window for 18 holes.

Important threshold:

- 10-11 m/s is not automatically red in Icelandic golf.
- discomfort around 13 m/s.
- hard/red around 17 m/s.

### `routeWeather(from, to, options)`

Needs directions/polyline provider. Do not implement route_safety as "endpoint weather only".

Phase 1 can prepare the model, but route_safety should not be called production-ready until provider/cost/privacy is approved.

### `caravanSafety(hours, equipment)`

Deterministic status for caravan/high-side travel.

Phase 1 status is based on:

- mean wind
- gusts

Crosswind:

- compute/store/display as context if available
- do not let crosswind determine `graent/gult/rautt` in Phase 1
- reserve crosswind thresholds/reason codes for Phase 2

## Thresholds

Keep thresholds in one code location. AI prompt must not contain its own threshold table as a source of truth.

Initial constants from spec:

```ts
export const WEATHER_THRESHOLDS = {
  caravan: {
    cautionWindMs: 13,
    redWindMs: 18,
    redGustMs: 25,
    cautionCrosswindMs: 10, // context only in Phase 1
    redCrosswindMs: 15,     // context only in Phase 1
  },
  golf: {
    discomfortWindMs: 13,
    hardWindMs: 17,
    eighteenHolesHours: 4.5,
  },
  dry: {
    maxPrecipMmPerHour: 0.1,
  },
  grill: {
    tooWindyMs: 8,
  },
  laundry: {
    goodDryHours: 4,
    helpfulWindMs: 3,
  },
  painting: {
    goodDryHours: 6,
  },
} as const;
```

## met.no Requirements

Claude Code must verify the official docs before implementation. The attachment and prior review call out these constraints:

- HTTPS only.
- GET only.
- Server-side BFF/proxy only. Do not call met.no directly from browser/client components.
- Identifying User-Agent from the first call.
- Cache responses.
- Respect `Expires`.
- Store/use `Last-Modified`.
- Send `If-Modified-Since` where appropriate.
- Handle `304` by using cached body.
- Handle `403` as likely User-Agent/terms issue.
- Handle `429` with throttle/backoff.
- Log/warn for `203`.
- Do not do `HEAD` plus `GET`.
- Round/truncate coordinates to maximum 4 decimals. 3 decimals is acceptable and better for cache hit rate.
- Show attribution: "Vedurgogn fra MET Norway / met.no."

Implementation caution:

- A purely in-memory cache may be acceptable for first local/dev iteration, but Claude Code should explicitly call out its production limits on serverless/Vercel.
- Do not add persistent DB/schema for weather cache unless Stebbi approves a broader scope.

## UI Direction

Follow `Design.md`.

Vedrid should feel like a finished Teskeid app screen, not a technical demo.

Required UI principles:

- Mobile-first, `max-w-lg` style app surface.
- No marketing hero.
- No dashboard/table-first weather UI.
- No card-in-card.
- Text input or textarea font size at least 16px on mobile.
- No horizontal overflow at 360, 390, or 460 px.
- Stable loading state. Submit button must not change width.
- Route segment must have `loading.tsx` with canonical Teskeid loader if auth/feature/data can wait.
- All user-facing copy in `messages/is.json` and `messages/en.json`.
- Status must not rely on color alone. Use text and icon/status label.
- Include "Af hverju?" or similar details disclosure for facts/reason code.
- Show met.no attribution somewhere small but visible.

Suggested first screen:

- header/back/menu consistent with authenticated Teskeid
- prompt label: "Hvad ertu ad paela?"
- textarea
- example chips/buttons:
  - "Er grillvedur i Moso i kvold?"
  - "Hvenaer er best ad spila 18 holur i Grafarholti a morgun?"
  - "Hvenaer er sidasti sjens fra Selfossi til Reykjavikur med hjolhysi?"
- submit action
- one main answer
- small status/facts section behind disclosure
- attribution
- debug/eval only in dev or under an explicit debug flag

## Suggested Implementation Phases

Do not let this become one huge unreviewable PR. Split into reviewable phases.

### Phase 0 - Read-only mapping

Claude Code should first inspect and report, without edits:

- existing route/page patterns under `app/auth-mvp`
- feature gate pattern in `lib/loans/guard.ts`
- home ready-card integration in `app/auth-mvp/heim/page.tsx`
- available UI primitives/components
- message namespace patterns
- testing conventions
- package dependencies and whether an Anthropic SDK exists
- any existing server-side fetch/cache helpers
- whether a current TODO number should be assigned in `TODO.md`

Output: revised implementation plan and explicit questions for Stebbi.

### Phase 1A - Feature shell and deterministic foundation

Only after approval:

- Add feature flags/env examples.
- Add feature access branch for `vedrid` using the existing global + optional per-user gate pattern.
- Add launched card route mapping only when `WEATHER_ENABLED`/access permits.
- Add `/auth-mvp/vedrid` final UI shell with `loading.tsx`.
- Add messages in Icelandic and English.
- Add types, thresholds, and deterministic helper tests.
- Add met.no client/parser with mocked tests.
- No production external calls from browser.

### Phase 1B - AI-first answer path

Only after deterministic tool output exists:

- Add ask endpoint/server action.
- Add deterministic answer wrapper.
- Add AI call behind `WEATHER_AI_ENABLED`.
- Validate `toolResultId`.
- Validate AI does not contradict deterministic status.
- Fallback to deterministic answer on every AI failure.
- Keep AI debug/eval visible only in dev/debug.

This phase should deliver the actual product feel Stebbi wants: AI-worded Teskeid answer when enabled, deterministic fallback when not.

### Phase 1C - Supported intents

Build from simplest useful intents to harder ones:

1. `place_weather_decision`: grill in Moso / simple activity at place.
2. `activity_window`: golf in Grafarholt with 4.5h window.
3. `route_safety`: Selfoss -> Reykjavik with caravan, only after directions provider is approved.

Do not fake route safety with endpoint-only weather.

### Phase 2 - Later

Do not start in Phase 1:

- campsites dataset
- official Vedurstofa alerts
- user profiles/equipment
- saved home area
- crosswind affecting caravan status
- multiple weather agents

## Provider Decisions Needed Before Build-Out

Claude Code should ask Stebbi before implementation commits to these:

- Geocoding provider: Google Places, Mapbox, Nominatim/OSM, or other.
- Directions provider: Google Directions, Mapbox Directions, OSRM, or other.
- AI HTTP strategy: native `fetch` to Anthropic API vs adding official SDK/dependency.
- Exact public contact string for `METNO_USER_AGENT`.
- Whether Vedrid should use per-user rollout from day 1 (`WEATHER_FLAG=true`) or only global `WEATHER_ENABLED`.

Recommendation:

- Use per-user gate support from day 1 if touching `checkFeatureAccess`, because the pattern already exists and lets Stebbi test with selected users.
- Keep the AI subflag global initially unless Stebbi specifically wants per-user AI exposure too.

## Tests / Acceptance

Minimum tests for implementation phases:

- `WEATHER_ENABLED` unset/false hides feature and guards route.
- `WEATHER_ENABLED=true`, `WEATHER_FLAG` unset: logged-in users can see/use Vedrid.
- `WEATHER_ENABLED=true`, `WEATHER_FLAG=true`: only users in `feature_access(feature_key='vedrid')` can see/use Vedrid.
- `WEATHER_AI_ENABLED=false`: deterministic answer is shown, no Anthropic call.
- `WEATHER_AI_ENABLED=true`: AI answer shown only when valid.
- AI missing/invalid `toolResultId`: deterministic fallback.
- AI contradictory wording/status: deterministic fallback.
- met.no fetch uses correct User-Agent and server-side path.
- met.no 304/403/429/203 cases are handled with mocked fetch.
- coordinates rounded/truncated.
- no unsafe wording in canned deterministic/AI validation paths.
- golf: 10-11 m/s is not red by itself.
- caravan: crosswind does not determine Phase 1 status.
- 14-day question: respond that met.no forecast window is about 9 days; week 2 is trend, not precise forecast.

Acceptance examples from attachment:

- A: caravan Selfoss -> Reykjavik
- B: golf Grafarholt
- C: grill Moso
- D: AI must not invent
- E: 14-day forecast limitation
- F: Icelandic golf wind threshold

## What Not To Do

- Do not write SQL/migrations for Phase 1 unless a later reviewed plan proves it is needed.
- Do not weaken RLS or feature access.
- Do not expose API keys to client code.
- Do not put `ANTHROPIC_API_KEY` in `NEXT_PUBLIC_*`.
- Do not call met.no from browser.
- Do not skip attribution.
- Do not hardcode AI model in business logic.
- Do not choose paid providers or add provider secrets without Stebbi approval.
- Do not add dependency packages without explicit approval.
- Do not run dev server; Stebbi runs localhost.
- Do not implement campsites, Vedurstofa alerts, or profiles in Phase 1.
- Do not let AI become the source of truth.
- Do not allow output that promises safety.

## Localhost checks for Stebbi

When Claude Code later implements this, Stebbi should test these manually before release:

1. With `WEATHER_ENABLED` unset or false:
   - Open `/auth-mvp/heim`.
   - Expected: Vedrid is not shown as an active Teskeid card.
   - Open `/auth-mvp/vedrid` directly.
   - Expected: access is denied/redirected according to the established feature-guard pattern.

2. With `WEATHER_ENABLED=true` and `WEATHER_AI_ENABLED=false`:
   - Open `/auth-mvp/heim`.
   - Expected: Vedrid card appears only if the idea/route is launched and feature access allows it.
   - Open `/auth-mvp/vedrid`.
   - Ask: "Er grillvedur i Moso i kvold?"
   - Expected: one deterministic, practical answer; no AI call required; no raw table as main output.

3. With `WEATHER_ENABLED=true` and `WEATHER_AI_ENABLED=true` plus valid server-side AI key:
   - Ask the same question.
   - Expected: AI-worded answer appears only if it validates against deterministic result.
   - Toggle/force AI failure locally if Claude Code provides a safe way.
   - Expected: deterministic fallback appears cleanly.

4. Mobile UI:
   - Test at 360px, 390px, and 460px.
   - Focus the textarea/input and open mobile keyboard.
   - Expected: no iOS zoom, no horizontal overflow, submit/loading state stays stable, answer does not overlap controls.

5. Sample questions:
   - "Hvenaer er best ad spila 18 holur i Grafarholti a morgun?"
   - "Ma eg fara med hjolhysi fra Selfossi til Reykjavikur seinnipartinn?"
   - "Hvernig verdur vedrid naestu tvaer vikur fyrir utilegu?"
   - Expected: clear action answer or honest scoped fallback. No safety guarantees.

6. Do not casually test:
   - real paid geocoding/directions providers
   - production secrets
   - production billing-impacting AI loops
   - production user-specific feature access

Those require explicit Stebbi approval and a separate rollout checklist.

## Questions for Claude Code To Answer In Phase 0

1. Which exact route, component, and message namespaces should Vedrid use to best match existing Teskeid patterns?
2. Is `checkFeatureAccess` the right home for `vedrid`, or is a weather-specific guard warranted? Codex recommendation: reuse `checkFeatureAccess`.
3. Does the repo already have a canonical loader component for `loading.tsx`?
4. Is there an existing server-side cache helper, or should Phase 1 use a small local cache abstraction with tests?
5. Should the first implementation include route_safety immediately, or should provider selection happen first?
6. Should Anthropic be called with native `fetch` first to avoid dependency churn, or should Stebbi approve adding a package?
7. What is the smallest useful first shipped intent set that still honors Stebbi's AI-first product decision?

## Suggested Next Step

Claude Code should do Phase 0 read-only mapping and return a revised implementation plan. It should not modify code, SQL, env files, dependencies, Supabase, or deployment settings until Stebbi explicitly approves the next implementation phase.
