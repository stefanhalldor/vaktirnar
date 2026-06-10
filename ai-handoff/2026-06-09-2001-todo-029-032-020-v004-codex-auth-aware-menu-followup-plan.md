# TODO #29 / #32 / #20 - Codex handoff plan

## Relevant TODO

- #29 Sýnilegri innskráning og context-aware nav
- #32 Skýrari texti fyrir nýskráningu/innskráningu
- #20 Bottom bar innskráning þarf stundum tvísmell á mobile

## Context from Stebbi

Stebbi staðfesti að fyrri lánalistavinna sé komin, en fann follow-up í
hamborgaravalmyndinni:

> Þegar Stebbi er innskráður og notar hamborgarann til að fara í hugmyndabankann,
> og opnar hamborgarann þaðan, þá tjékkar hann ekki hvort Stebbi sé innskráður.
> Hann sýnir bara `Innskráning`, sem sendir Stebba á `/heim`. Stebbi vill geta
> farið heim og beint inn í þær Teskeiðar sem eru í boði fyrir notandann.

Codex skoðaði kóðann read-only og líkleg orsök er:

- `components/teskeid/NavBar.tsx` er client component og kallar alltaf
  `<TeskeidMenu variant="public" />`.
- `app/page.tsx` og `app/senda-hugmynd/page.tsx` nota `<NavBar />`.
- Authenticated síður nota víða `<TeskeidMenu variant="authenticated" />`.
- `app/innskraning/page.tsx` redirectar innskráðan notanda á `/auth-mvp/heim`,
  sem útskýrir af hverju public `Innskráning` virkar eins og óbeinn heim-linkur.

## Goal

Laga hamburger navigation þannig að hún sé raunverulega auth-aware líka á public
Teskeið síðum, sérstaklega hugmyndabanka og `Ný hugmynd`.

Ekki breyta auth guards, RLS, Supabase policies eða loan permissions. Þetta er
leiðsagnar-/UI-fix, ekki öryggisbreyting.

## Recommended implementation

1. Keep `TeskeidMenu` as the reusable client menu.

2. Make public pages pass the correct `variant` into `NavBar`.
   - Minimal path: add `variant?: 'public' | 'authenticated'` prop to
     `components/teskeid/NavBar.tsx`, defaulting to `public`.
   - `NavBar` can stay client-side if the server page computes the variant and
     passes it as a serializable prop.

3. On `app/page.tsx`, read Supabase session server-side.
   - The page already creates a Supabase server client to fetch public ideas.
   - Use `supabase.auth.getUser()` or the repo's established server-session
     pattern.
   - Pass `<NavBar variant={hasUser ? 'authenticated' : 'public'} />`.
   - Do not expose user data to the client beyond the boolean/variant.

4. On `app/senda-hugmynd/page.tsx`, also decide menu variant server-side.
   - Import/create the Supabase server client.
   - Use the same session check as `app/page.tsx`.
   - Pass the computed variant to `<NavBar />`.

5. Check whether any idea detail route uses a separate public shell.
   - If a public idea detail page has a hamburger/menu, it must use the same
     auth-aware pattern.
   - If no menu exists there, do not add unrelated navigation in this pass.

6. Handle #32 while touching navigation labels.
   - Public auth menu label should be clearer than just `Innskráning`.
   - Codex recommendation:
     - Menu/bottom-nav label: `Nýskráning / innskráning` if it fits.
     - If too long for bottom nav, use `Nýskrá / inn` or keep bottom nav for a
       separate compact-label decision, but document the tradeoff.
   - Put user-facing text in `messages/is.json` and `messages/en.json`, not
     hardcoded into new code.

7. Re-test #20 after the change.
   - If the original bottom-bar double-tap issue is no longer reproducible,
     Claude Code should say so in the post-implementation handoff.
   - If it is still reproducible, leave #20 open with exact reproduction notes.

## Acceptance criteria

- Innskráður notandi á `/` sér authenticated hamburger items:
  - `Heim`
  - `Minn prófíll`
  - `Lánað og skilað`
  - public hugmyndaleiðir eftir samhengi, t.d. `Hugmyndabankinn` og `Ný hugmynd`
- Innskráður notandi á `/senda-hugmynd` sér sömu authenticated hamburger leiðir.
- Innskráður notandi á public hugmyndasíðum sér ekki villandi `Innskráning` sem
  er í raun óbeinn redirect heim.
- Óinnskráður notandi á `/`, `/senda-hugmynd` og `/innskraning` sér áfram skýra
  nýskráningar-/innskráningarleið.
- Current page active state heldur áfram að vera rétt.
- Menu veldur ekki horizontal overflow eða mobile tap/regression.
- Engin breyting er gerð á Supabase RLS, policies, RPC grants, auth guards eða
  production gögnum.

## Tests Claude Code should run

- `npm run type-check`
- `npm run test:run -- lib/__tests__/teskeid-menu.test.tsx`
- Relevant page tests if they exist or are updated:
  - `lib/__tests__/innskraning-page.test.tsx`
  - `lib/__tests__/home-page.test.tsx`
- If tests are added for public `NavBar` auth-aware behavior, run those
  targeted tests too.

## Manual localhost checks for Stebbi

Claude Code should ask Stebbi to test:

1. Logged out: open `/`, open hamburger, confirm public items and
   `Nýskráning / innskráning` or approved shorter copy.
2. Logged in: open `/`, open hamburger, confirm `Heim`, `Minn prófíll` and
   `Lánað og skilað` are available directly.
3. Logged in: open `/senda-hugmynd`, open hamburger, confirm the same.
4. Tap all menu links once on mobile. No double-tap should be required.
5. Confirm there is no horizontal scrolling or overlap at 360-460 px width.

## Post-implementation handoff required

Claude Code should execute this small package and then create a new handoff file:

`ai-handoff/YYYY-MM-DD-HHMM-todo-029-032-020-v005-claude-auth-aware-menu-post-implementation.md`

The handoff should include:

- What Claude Code changed.
- Files inspected.
- Files modified.
- Commands run with exit codes.
- Whether #20 double-tap was reproducible before/after.
- Whether any route still uses hardcoded public menu while authenticated.
- Any remaining risk or follow-up before Codex review.
