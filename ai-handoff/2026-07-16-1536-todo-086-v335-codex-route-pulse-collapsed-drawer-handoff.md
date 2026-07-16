# TODO 086 v335 - Codex handoff: Route Safnpuls collapsed drawer

Created: 2026-07-16 15:36  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Related handoffs:
- `2026-07-16-1451-todo-086-v331-codex-v330-route-pulse-realtime-title-handoff.md`
- `2026-07-16-1456-todo-086-v332-codex-v331-chat-core-realtime-addendum.md`
- `2026-07-16-1527-todo-086-v333-claude-v332-done-prerelease.md`
- `2026-07-16-1531-todo-086-v334-codex-v333-prerelease-review.md`

## Context

Stebbi tested the new route-scoped Safnpuls summary in `/vedrid` and the product direction needs adjustment before this feels good.

Current UI problem from Stebbi:

> Það er eitthvað við þetta sem ég er ekki að fíla... það sést illa hvaða skilaboð eiga við hvaða stöð, léleg aðgreining á stöðvunum líklega eins skýring... svo tekur þetta mjög mikið pláss á skjánum, spurning um að setja í collapsed skúffu neðst í "Á leiðinni" sectioninu frekar?

Screenshot shows `NYJAST FRA NOTENDUM TESKEID.IS` as a large card-like block with multiple station groups:

- Gardabaer - Kauptun
- Sandskeid
- Hellisheidi
- Ingolfsfjall
- Selfoss
- Thjorsarbru

The messages are technically grouped, but visually too flat. It is hard to scan which message belongs to which station, and the whole block consumes too much vertical space.

## Files inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `components/weather/VedurstofanRoutePulseSummary.tsx`
- `components/chat/ChatPreviewList.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

## Design.md constraints that matter

This is a UI/layout change, so `Design.md` applies.

Relevant rules:

- Teskeid should be mobile-first, compact but not cramped.
- Page sections should not become heavy floating card stacks.
- Avoid nested rounded cards unless the inner element is an actual independent tool.
- Inside an existing summary/card context, prefer `border-y`, `divide-y`, and structured rows over another full card.
- Text hierarchy should be clear: card title `text-sm`/`text-base`, metadata `text-xs`, buttons `text-sm`.
- Controls and text must not cause horizontal overflow on 360-460 px mobile widths.
- Navigation/loading states must not feel dead if a link opens the full pulse.

## Findings

1. **Product/UI: Route Safnpuls is too visually heavy in its current form**

   `components/weather/VedurstofanRoutePulseSummary.tsx` renders a full rounded bordered block:

   ```tsx
   <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3">
   ```

   That works for a small preview, but not for route-level aggregation where several stations can each have up to 3 messages. On real routes this becomes a large vertical feed inside an already dense result screen.

2. **Product/UI: Station grouping is too weak**

   The current station group is:

   ```tsx
   <div className="flex flex-col gap-1.5">
     <p className="text-xs font-medium text-foreground">{station.stationName}</p>
     <ChatPreviewList ... />
     <Link>Sjá fleiri skilaboð</Link>
   </div>
   ```

   The station name is only slightly stronger than message metadata, and station groups have no divider, inset, count, or visual rhythm. With multiple stations, ownership of messages becomes unclear.

3. **Product/UI: The right default is collapsed**

   Route Safnpuls is useful contextual data, but it should not compete with the core route decision UI. The default state should be a compact collapsed drawer/disclosure at the bottom of the `Á leiðinni` section. It should expand only when the user asks for it.

4. **Placement: It should live at the bottom of `Á leiðinni`, not as a big block after destination context**

   Current placement in `FerdalagidClient.tsx` is after the main summary fragments and before the weather comparison block. In the tested UI it appears after `Áfangastaður`, which makes it feel like it belongs to the whole result page but still interrupts the flow.

   Stebbi's intended mental model is: "these are user reports from stations on the route." That belongs under `Á leiðinni`, after the worst/selected route condition content, before `Áfangastaður`/comparison/map spillover.

5. **Do not solve this by reducing data quality**

   Keep the useful behavior:

   - route order
   - latest messages per station
   - realtime refresh / chat-core refresh event from v332/v333
   - public preview behavior
   - authenticated full pulse/post flow
   - `returnTo` behavior

   The change is presentation and default disclosure state, not data loss.

## Recommended implementation

### 1. Convert `VedurstofanRoutePulseSummary` into a compact disclosure

Render nothing when there are no messages, as now.

When messages exist, default to collapsed:

- collapsed row title: `Nýjast frá notendum Teskeið.is`
- small summary line:
  - example: `6 stöðvar með nýlegar umferðarfréttir`
  - or: `12 nýleg skilaboð á leiðinni`
- chevron icon or clear disclosure affordance
- the whole row should be a button with `aria-expanded`

Suggested structure:

```tsx
<section className="border-t border-border pt-3">
  <button
    type="button"
    aria-expanded={open}
    className="flex w-full items-center justify-between gap-3 py-2 text-left"
  >
    <span className="min-w-0">
      <span className="block text-sm font-medium text-foreground">
        Nýjast frá notendum Teskeið.is
      </span>
      <span className="block text-xs text-muted-foreground">
        {stationCount} stöðvar með nýlegar umferðarfréttir
      </span>
    </span>
    <ChevronDown ... />
  </button>

  {open && (
    <div className="divide-y divide-border">
      ...
    </div>
  )}
</section>
```

Important: this should not look like a big card inside a card. Prefer a bordered row/disclosure inside the existing result structure.

### 2. Make station groups visually distinct when expanded

Inside the open drawer, use a station group layout that makes ownership obvious:

- station header row:
  - station name in `text-sm font-medium`
  - optional small count: `3 skilaboð`
  - optional route position or distance if already available and cheap
- messages indented or placed under a subtle left border
- divider between stations
- one small station-level link: `Sjá fleiri skilaboð`

Suggested structure:

```tsx
<div className="py-3">
  <div className="mb-2 flex items-baseline justify-between gap-2">
    <p className="text-sm font-medium text-foreground">{station.stationName}</p>
    <span className="text-xs text-muted-foreground">{messages.length} nýleg</span>
  </div>
  <div className="border-l border-border pl-3">
    <ChatPreviewList ... />
    <Link ...>Sjá fleiri skilaboð</Link>
  </div>
</div>
```

Avoid repeating a loud link or full button for every station. The per-station link can stay, but it should be visually secondary.

### 3. Keep route preview data loading even while collapsed

Do not make the drawer lazy-load only after opening unless there is a clear reason. The current fetch/poll/refresh behavior is fine because it can keep the compact summary accurate. The collapsed row can update count/message availability without moving the layout.

Still keep:

- no messages => render nothing
- route-preview cap/chunking decision from v334/v333
- `teskeid:pulse:refresh`
- 30 second refresh unless chat-core realtime fully replaces it later

### 4. Move placement to bottom of `Á leiðinni`

Current location around `FerdalagidClient.tsx:1731` is outside/after the main summary fragment. Move or restructure so the compact drawer appears at the bottom of `Á leiðinni`.

Expected order in summary:

1. Departure context / chosen departure
2. `Á leiðinni`
3. worst/selected route weather content
4. compact route Safnpuls disclosure
5. `Áfangastaður`
6. comparison and other supporting sections

If the exact `FerdalagidClient.tsx` structure makes that placement awkward, do the smallest safe move that places it immediately after the worst/route condition section and before the destination section.

### 5. Translation keys

Do not hardcode new user-facing text. Add/update Icelandic and English keys in `messages/is.json` and `messages/en.json`.

Potential keys:

- `safnpulsRouteTitle`: `Nýjast frá notendum Teskeið.is`
- `safnpulsRouteSummaryStations`: `{count} stöðvar með nýlegar umferðarfréttir`
- `safnpulsRouteSummaryMessages`: `{count} nýleg skilaboð á leiðinni`
- `safnpulsRouteExpand`: `Opna`
- `safnpulsRouteCollapse`: `Loka`
- `safnpulsStationMessageCount`: `{count} nýleg`

Use existing naming conventions if nearby message keys already differ.

## What not to change

- Do not change database schema.
- Do not change RLS.
- Do not change chat-core table model.
- Do not change full station pulse URL behavior.
- Do not remove route-scoped Safnpuls.
- Do not add AI summarization yet.
- Do not commit, push, deploy, or run migrations.

## Relationship to reusable chat-core direction

This should keep the existing reusable chat-core direction intact:

- `ChatPreviewList` remains the generic preview renderer.
- Route Safnpuls remains a weather-specific adapter that arranges multiple station previews.
- Do not fork message rendering into route-specific one-off UI unless the difference is just layout wrappers around reusable chat components.

If a reusable grouped preview primitive would help, keep it small and generic, for example:

- `GroupedChatPreviewList`
- accepts groups with `title`, `messages`, `href`
- does not know about Veðurstofan or routes

But do not introduce that abstraction unless it actually reduces duplication now.

## Suggested Claude Code plan

1. Read this handoff, `Design.md`, and current component placement.
2. Confirm whether any current message keys already cover the needed drawer labels.
3. Update `VedurstofanRoutePulseSummary`:
   - add collapsed state, default false/open = false
   - render compact disclosure row
   - render expanded station groups with clearer separation
   - keep hidden when no messages
   - keep refresh behavior
4. Move usage in `FerdalagidClient.tsx` to bottom of `Á leiðinni`.
5. Add/update translations.
6. Run focused checks:
   - `npm run type-check`
   - relevant tests if existing around chat/weather route pulse
7. Create a Claude handoff with screenshots/checklist instructions for Stebbi.

## Localhost checks for Stebbi

Test on `http://localhost:3004/vedrid` and authenticated `/auth-mvp/vedrid`.

Setup:

- Use a route that has several Veðurstofan stations with pulse messages, for example the route from the screenshot.
- Test both public and logged-in states if possible.

Checks:

1. Route result with messages:
   - Route Safnpuls appears as a compact collapsed row at the bottom of `Á leiðinni`.
   - It no longer pushes a long list of station messages down the page by default.
   - The title says `Nýjast frá notendum Teskeið.is`.

2. Expanded drawer:
   - Opening the drawer shows station groups clearly.
   - It is obvious which messages belong to which station.
   - Station groups have clear separation, but not bulky nested cards.
   - `Sjá fleiri skilaboð` still opens the correct station pulse.

3. Realtime/refresh:
   - Add a new message to a station.
   - The station card preview and route drawer should update consistently.
   - The collapsed route summary should not cause layout jump when new messages arrive.

4. Empty state:
   - On a route with no pulse messages, route Safnpuls should be hidden.
   - Public users should not see empty route pulse copy.

5. Mobile layout:
   - Check 360 px, 390 px, and 460 px widths.
   - No horizontal overflow.
   - Collapsed row text fits or wraps professionally.
   - Opening the drawer does not make the page feel broken or card-inside-card heavy.

6. Return behavior:
   - From a station link inside the route drawer, open full pulse.
   - `returnTo` should return to the same trip context, not `/elta-vedrid` or home.

## Open questions / needs Stebbi confirmation

- Should the collapsed summary show count by station, count by message, or both?
  - Codex recommendation: station count first, because the core issue is station context.
- Should there be one route-level "Sjá allt" link later?
  - Codex recommendation: not now. Keep station-level full pulse links until there is a real route pulse URL/product.

## Codex recommendation

Yes, change this before broad release of route Safnpuls.

The feature idea is good, but the current presentation makes the route result feel noisy and unclear. A collapsed disclosure at the bottom of `Á leiðinni` preserves the value while making the main weather decision flow calmer and easier to scan.
