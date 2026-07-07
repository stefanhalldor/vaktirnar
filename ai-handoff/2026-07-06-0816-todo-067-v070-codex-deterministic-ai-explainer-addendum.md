# 2026-07-06-0816-todo-067-v070-codex-deterministic-ai-explainer-addendum

Created: 2026-07-06 08:16  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Addendum for TODO-067 weather/travel result UI. This is not a code change request by itself; it should be included around the next Claude Code handoff/execution pass that touches the result/audit UI.

## Product Context

Stebbi raised a product concern: users will ask whether Teskeið is just using AI to guess a weather answer. We should answer that in the interface, calmly and transparently.

The intended positioning is:

- Teskeið uses deterministic data and rules for the actual weather assessment.
- AI may help with phrasing or follow-up questions later.
- AI does not decide whether the trip is safe/good/bad.
- The user can inspect the route, forecast points, decisive weather point, time, and metric.

This helps distinguish Teskeið from a generic ChatGPT-style answer. The product should feel like an app that can show its work, not a chat answer that sounds confident.

## Recommended UI Placement

Add this near the result/audit area, not as a big warning box.

Preferred structure:

1. A short trust line under the main result card:

   `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`

2. An expandable section near `Af hverju?` or route-point audit:

   Title:

   `Hvernig er þetta metið?`

3. Expanded content:

   Show a short explanation and then connect it to the visible audit UI:

   - route line
   - sampled forecast points
   - highlighted/worst point
   - time of the decisive value
   - wind/gust/precipitation values

Do not show this as a large always-open explainer unless the result UI has room. The main result should stay scannable.

## Suggested Icelandic Copy

Short line:

`Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`

Expandable title:

`Hvernig er þetta metið?`

Expanded body:

`Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.`

Optional shorter body if space is tight:

`Við reiknum matið út frá leið, tíma og veðurspá á punktum meðfram leiðinni. Gervigreind getur hjálpað við orðalag, en veðurgögnin og viðmiðin ráða niðurstöðunni.`

## Suggested English Copy

Short line:

`Calculated from the route and forecast, not guessed by AI.`

Expandable title:

`How is this assessed?`

Expanded body:

`The weather assessment is calculated from the route, timing, and forecast points along the way. AI does not make the decision itself. It may help us phrase the result, but wind, gusts, precipitation, time, and location determine the assessment.`

Optional shorter body:

`We calculate the assessment from the route, timing, and forecast points along the way. AI may help with wording, but weather data and thresholds determine the result.`

## Implementation Notes For Claude Code

- Put all copy in `messages/is.json` and `messages/en.json`.
- Do not hardcode the copy in `FerdalagidClient.tsx`.
- Keep the component visually quiet:
  - small muted trust line
  - expandable detail section
  - no large marketing-style explanation
- If the route audit map is present, the explainer should visually sit near it or near `Af hverju?`.
- The copy should not overpromise safety. It explains the calculation model, not a guarantee.
- Keep the existing disclaimer that this is weather assessment, not traffic or travel safety insurance.

## Acceptance Criteria

- Result screen includes a short line explaining that the assessment is calculated from route/forecast data, not guessed by AI.
- Expanded section explains that AI does not decide the result.
- The explanation points users toward the visible evidence: route, points, worst point, time, and weather values.
- Icelandic and English copy both exist in message files.
- Mobile layout remains clean at 360, 390, and 460 px.
- No horizontal overflow.
- No production/env/Supabase/SQL changes.

## Localhost Checks For Stebbi

After Claude Code includes this in a UI pass:

1. Open `/auth-mvp/vedrid`.
2. Run a normal route weather check, e.g. Reykjavík to Selfoss.
3. Confirm the result screen shows a short trust line near the result.
4. Open `Hvernig er þetta metið?`.
5. Expected:
   - text clearly says the result is calculated from route, timing, and forecast points
   - text says AI does not make the decision itself
   - wording feels calm and trustworthy, not defensive
   - it does not claim the trip is guaranteed safe
6. Check mobile widths around 360, 390, and 460 px:
   - no horizontal overflow
   - explainer text wraps cleanly
   - audit map and route-point list remain usable

## Suggested Message To Claude Code

```txt
Claude Code, þegar þú ert næst að snerta Ferðalagið result/audit UI, taktu líka inn ai-handoff/2026-07-06-0816-todo-067-v070-codex-deterministic-ai-explainer-addendum.md.

Markmiðið er að notandi sjái skýrt að veðurmatið er reiknað úr leið, tíma og veðurspá á punktum meðfram leiðinni, ekki giskað af gervigreind. Gervigreind má síðar hjálpa við orðalag, en hún tekur ekki ákvörðunina sjálf.

Settu texta í messages/is.json og messages/en.json, ekki hardcode-a í component.
```
