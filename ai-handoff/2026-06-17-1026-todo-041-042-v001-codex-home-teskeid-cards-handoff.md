# TODO #41 + #42 - Heimaskjar Teskeidar og Umonnun feature flag

**Agent:** Codex  
**Fyrir:** Claude Code  
**Stada:** Framkvaemdarhandoff, en Claude Code a ad byrja a stuttri eigin ryni a nuverandi kodaleidum.  
**Tengd TODO:** #42 Tilbunar Teskeidar efst og sidast opnud fyrst; #41 Umonnun sem feature-flagged Teskeid.

## Stebbi request

Stebbi vill taka naesta pakka sem snertir heimaskja:

- Gera tilbunar/virkar Teskeidar meira aberandi efst a `/heim`.
- Ekki hafa tilbunar Teskeidar i sama lista og vaentanlegar Teskeidar.
- Rada virkum Teskeidum dynamiskt per notanda eftir thvi hvada Teskeid notandi
  opnadi sidast.
- Setja Umonnun inn sem Teskeid undir feature flag.
- Thegar notandi smellir a Umonnun a ad utskyra ad Umonnun se ser app vegna
  vidkvaemra gagna og thvi ad Umonnun kom ut adur en Teskeid.is vard til.
- Thegar Teskeid verdur app a ad taka stefnumotandi akvordun um hvort Umonnun
  falli undir Teskeid eda verdi afram ser app.

## Codex recommendation

Taka #42 og #41 saman, en halda #30 utan vid thennan pakka.

Astadan: #42 og #41 snerta sama heimaskja/lista og geta notad sama card/layout
mynstur. #30 er branding/favicon og thar er betra ad hafa ser approval loop med
preview, thvi thad snertir logo/app-icon akvardanir frekar en product flow.

## Critical constraints

1. Ekki flytja, saekja eda birta nein raunveruleg Umonnun-gogn inni i Teskeid.is.
2. Ekki setja Umonnun API lykla, secrets, deeplink tokens eda notendagogn i
   client payload, logs, messages eda config sem fer i browser.
3. Ekki breyta Supabase, SQL, RLS, auth, policies, billing eda deployment i
   thessum fyrsta pakka nema Claude Code stoppi fyrst og skili nyju plan/handoff
   til Stebba og Codex.
4. Umonnun a i fyrstu ad vera informational/redirect card bak vid feature flag,
   ekki innbyggd gagnavinnsla.
5. Allur notendatexti a ad fara i `messages/is.json` og `messages/en.json`, ekki
   hardcode-adur i component.
6. Ef notad er per-user "sidast opnad" state: velja fyrst einfaldasta orugga
   leid. Ef lausnin tharf server-side storage, stoppa og skila ser SQL/RLS plani
   adur en migration er skrifud.

## Suggested implementation shape

### Phase A - Read-only audit

Claude Code a fyrst ad lesa:

- `app/auth-mvp/heim/page.tsx`
- `app/auth-mvp/heim/RecentSection.tsx`
- relevant `components/teskeid/*` cards/menu/list components
- `lib/teskeid/types.ts`
- `messages/is.json`
- `messages/en.json`
- tests around home page, likely `lib/__tests__/home-page.test.tsx`
- feature flag patterns in `lib/loans/guard.ts`, `lib/auth/guard.ts`, `.env.example`
  or wherever existing public flags are documented

Goal: identify current source of home Teskeid list, current active/disabled
presentation, and best local feature flag pattern.

### Phase B - Active Teskeidar first (#42)

Implement a clear active Teskeidar area near the top of `/heim`.

Minimum acceptable behavior:

- `Lanad og skilad` stays visible as an active Teskeid when user has access.
- Active/ready Teskeidar are visually separated from future/upcoming ideas.
- Upcoming/future items do not look equally actionable.
- New user with no history gets a stable default order.

About "sidast opnad":

- Prefer a small client-side first version if it can be done without weakening
  auth and without misleading cross-device expectations.
- If client-side state is used, be explicit in code/tests that this is local
  browser personalization only.
- If Stebbi needs cross-device per-user ordering, do not improvise a data model.
  Stop and create a SQL/RLS handoff first.

Important UX rule:

- The active Teskeid section should be useful immediately on mobile. Avoid a
  marketing hero or decorative section. This is an app home screen, not a
  landing page.

### Phase C - Umonnun feature-flagged card (#41)

Add Umonnun as a Teskeid card only when a feature flag is enabled.

Recommended first behavior:

- Flag off: Umonnun is absent from normal users.
- Flag on: Umonnun appears as an active/available card or clearly marked card,
  depending on design fit.
- Click opens a local informational route or modal, not Umonnun data.
- The content explains:
  - Umonnun is currently a separate app.
  - It is separate because the topic and data are very sensitive.
  - Umonnun existed before Teskeid.is.
  - Later, when Teskeid becomes an app, Stebbi will decide whether Umonnun
    belongs directly under Teskeid or remains a separate app.
  - Meanwhile, people can use Umonnun as its own app.
- Include links to:
  - App Store
  - Play Store
  - `umonnun.is`

Open question for Claude Code before coding:

- Are App Store and Play Store URLs already known in repo/config?
- If not, use safe placeholders only if Stebbi approves; otherwise include
  disabled/missing-link fallback and ask Stebbi for exact store URLs.

## Feature flag guidance

Use existing project patterns where possible. Do not create broad config
abstractions unless the repo already has one.

Acceptable first flag examples:

- `UMONNUN_ENABLED`
- `NEXT_PUBLIC_UMONNUN_ENABLED` only if the flag only controls presentation and
  exposes no secret or sensitive state.

Codex preference:

- Server-side flag for deciding whether the card appears on `/heim`.
- If client component needs to know it, pass a boolean prop from server.
- Do not expose any secret; a public boolean flag is fine only if it is not meant
  as security control.

## Tests expected

Add or update focused tests.

Likely test file:

- `lib/__tests__/home-page.test.tsx`

Expected coverage:

- Active Teskeidar section renders before upcoming/future ideas.
- `Lanad og skilad` remains visible for users with loans feature access.
- Upcoming/future items are visually/textually distinct from active Teskeidar.
- Umonnun is hidden when feature flag is off.
- Umonnun is visible when feature flag is on.
- Umonnun click target opens informational UI/route, not protected Umonnun data.
- Umonnun text/link labels come from messages.
- No Umonnun sensitive payload, API key, email or user data is included in client
  render output.

If localStorage or client-side last-opened state is introduced:

- Test stable fallback when no last-opened value exists.
- Test invalid/stale last-opened value does not break `/heim`.
- Test opening an active Teskeid records/reorders only expected known keys.

## Files likely touched

Expected:

- `app/auth-mvp/heim/page.tsx`
- maybe a small new home client component if last-opened state is client-side
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/home-page.test.tsx`
- maybe `.env.example` if adding a documented feature flag

Avoid unless a new handoff approves it:

- `sql/`
- Supabase policies/RLS/grants/functions
- auth guards
- billing/deployment settings
- Umonnun backend/API integrations
- icon/favicon assets for #30

## Risk assessment

**Overall risk:** Medium-low if kept as presentation-only.  
**Risk becomes high** if Claude Code adds server-side per-user storage, Umonnun
data integration, external API calls, auth changes, SQL, or secrets.

Main risks:

- Accidentally making future/upcoming ideas look like active Teskeidar.
- Feature flag accidentally exposing Umonnun card in production before Stebbi is
  ready.
- Store links missing or wrong.
- Umonnun copy implying sensitive data has moved into Teskeid.is.
- Per-user ordering leaking or sharing state between users if server-side storage
  is attempted without proper RLS.

## Localhost checks for Stebbi

Page:

- `http://localhost:3000/auth-mvp/heim`

Suggested setup:

- Test with a normal logged-in user.
- Test once with Umonnun flag off.
- Test once with Umonnun flag on.
- If last-opened ordering is local-only, use the same browser profile for the
  ordering check.

Checks:

1. Open `/auth-mvp/heim`.
2. Confirm active/ready Teskeidar are clearly near the top and not mixed into
   the same list as upcoming/future items.
3. Confirm `Lanad og skilad` is still easy to find and open.
4. Open `Lanad og skilad`, then go back to `/heim`.
5. Confirm the last-opened behavior matches the implemented scope:
   - if local-only, it updates in the same browser;
   - if not implemented yet, Claude Code must say so clearly.
6. With Umonnun flag off, confirm Umonnun does not appear.
7. With Umonnun flag on, confirm Umonnun appears.
8. Click Umonnun.
9. Expected: Stebbi sees an explanation that Umonnun is a separate app because
   the data/topic is sensitive and because it predates Teskeid.is.
10. Confirm the page does not show real Umonnun user data.
11. Confirm links to App Store, Play Store and `umonnun.is` behave as expected,
    or that missing links have a calm fallback.
12. Test at 360-460 px mobile width: no horizontal scroll, overlap or cramped
    card text.

What Stebbi should not test casually:

- Do not connect real Umonnun production data.
- Do not paste secrets/API keys into `.env.local` for this package.
- Do not run SQL or Supabase changes for this package unless a new reviewed
  handoff explicitly approves that path.

## Done criteria

This package is done when:

- #42 active Teskeid ordering/visibility is implemented within the approved
  scope.
- #41 Umonnun appears only behind the chosen feature flag.
- Umonnun click target is informational only.
- i18n text is in messages.
- Focused tests pass.
- `npm run type-check` passes.
- Claude Code produces post-implementation handoff listing exact files, commands,
  test results, and any remaining decisions for Stebbi/Codex.
