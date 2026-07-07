# todo-067 v080 - Codex review of v079, add forecast point auditability

Created: 2026-07-06 14:35  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-06-1140-todo-067-v079-claude-v078-plan`  
Reviewer: Codex

## Findings

### P1 - Do not call these "weather stations" unless we actually use station observations

Stebbi's new requirement is right: the map should show the exact locations that the answer is based on. But the implementation and user-facing copy need to be precise.

The current travel/weather model is not using physical weather stations. It uses route sample points and met.no forecast/model coordinates:

- Route point / vegpunktur: `lat`, `lon`
- Forecast point / met.no spápunktur: `forecastLat`, `forecastLon`

Those can be identical or very close, but they are conceptually different. The UI should use words like:

- `spápunktur`
- `met.no spápunktur`
- `punktur á leið`

It should not say `veðurstöð` unless a later phase adds actual station metadata from Veðurstofan or another observation source.

### P1 - V079 should explicitly add forecast-point markers to the interactive map

The current audit-map direction is good, but it is still weaker than what Stebbi is asking for if the map only marks sampled road points on the route.

The trust-building version should show both:

- the actual driving route as a blue line
- the sampled route points used for route/weather evaluation
- the exact met.no forecast points used for the weather values
- the worst/highlighted point, tied to both its route point and forecast point

Recommended map behavior:

- Keep route sample markers on the route, colored by severity.
- Add a smaller outlined marker or diamond for the corresponding `forecastLat`/`forecastLon`.
- If route point and forecast point differ by more than a small threshold, e.g. 100-200 meters, draw a subtle connector line between them.
- On tap/click, select the route point and show both coordinates in the details sheet.
- Use the met.no/yr.no link for the forecast coordinate, not the road coordinate.

This solves the exact concern Stebbi raised earlier: "is this point actually part of the forecast and is it relevant to the route?"

### P2 - Keep next-caution data deterministic, but avoid pre-translated text in core data

V079 proposes `reasonText` inside `NextCaution`. I would avoid adding pre-translated Icelandic copy to the core weather result shape.

Better:

- keep `reasonCode`
- keep `issue`
- keep `departureIso`, `arrivalIso`, `scannedHours`
- let the UI format text via `messages/is.json` and `messages/en.json`

The existing code already has Icelandic `svar`/facts debt, but new UI-facing result fields should not deepen that debt if the fix is small.

### P2 - "No next caution" needs a separate insufficient-coverage state

Skipping `no_data` as a caution is correct. But the UI must not say "engin varúð næstu 0 klst." or imply safety beyond forecast coverage.

Suggested states:

- caution found: show when and why
- no caution found with useful coverage: "Engin varúð fannst á leiðinni næstu {hours} klst."
- insufficient coverage: "Við náðum ekki að meta næstu klukkustundir nógu vel út frá spágögnum."

### P2 - Window-mode scan is acceptable only if the copy is explicit

If the selected departure window is green and `nextCaution` scans after `latestDepartureIso + step`, the UI copy must say that.

Good wording:

`Næst verður varasamt eftir valda brottfarargluggann: {time}.`

For the MVP it is also acceptable to implement next-caution only for single departure assessment first, then add window-mode nuance later. But if V079 implements window mode now, it needs explicit copy so the user does not interpret it as "from now".

### P3 - Use repo scripts for verification

V079 should ask Claude Code to run:

- `npm run type-check`
- `npm run test:run`

Avoid `npx ...` unless there is a specific reason, because repo scripts are clearer and match the existing workflow approvals.

## Required addition to V079

Add this requirement to the implementation plan before Claude Code executes it:

The result map must not only show the route. It must also show the forecast/model coordinates that the weather decision used.

Implementation details:

- `TravelAuditMap` should render route sample markers at `point.lat`, `point.lon`.
- It should also be able to render forecast-point markers at `point.forecastLat`, `point.forecastLon`.
- The selected details UI should show both:
  - `Punktur á leið: {lat}, {lon}`
  - `Spápunktur met.no: {forecastLat}, {forecastLon}`
- The explanation should say:
  - `Veðurmatið notar spá fyrir þennan met.no punkt. Hann getur verið örlítið frá veginum því spáin er á hnitaneti.`
- Links labeled `Skoða veðurspá` should open the forecast-point URL (`metnoUrl` or `yrnoUrl`), not raw JSON.
- If a route point and forecast point are visually separated, draw a subtle connector line.
- Do not fetch actual weather station data in this pass. That is a separate feature.

Suggested helper names:

- `getRoutePointLatLng(point)`
- `getForecastPointLatLng(point)`
- `isSameCoordinatePair(a, b, toleranceMeters)`
- `shouldShowForecastPointMarker(point)`

Suggested new message keys:

- `routePointMarkerLabel`: `Punktur á leið`
- `forecastPointMarkerLabel`: `Spápunktur`
- `routePointDetails`: `Punktur á leið: {lat}, {lon}`
- `forecastPointDetails`: `Spápunktur met.no: {lat}, {lon}`
- `forecastPointExplanation`: `Veðurmatið notar spá fyrir þennan met.no punkt. Hann getur verið örlítið frá veginum því spáin er á hnitaneti.`

## Answers to V079 open questions

1. Scan after latest departure in window mode?

Yes, but only if the copy says "eftir valda brottfarargluggann". If that wording feels too complex, implement next-caution only for single departure in this pass and leave window-mode for the next handoff.

2. Skip `no_data`?

Yes. `no_data` should not be treated as a warning. It should become an insufficient-coverage state if coverage is too low.

3. Is Icelandic `reasonText` in `NextCaution` acceptable?

I recommend no. Store deterministic facts and reason codes in weather logic, then format UI text through messages.

4. Should `scannedHours` be the actual successful horizon?

Yes. Be honest about the scan horizon. If it is too low to be useful, show insufficient coverage instead of "no caution".

## Suggested message for Claude Code

```text
Við skulum uppfæra V079 áður en þú framkvæmir.

Codex samþykkir megináttina í V079, en bættu þessu inn:

1. Ekki kalla punktana "veðurstöðvar" í UI eða kóða nema við séum í alvöru að nota physical observation stations. Í þessum fasa eru þetta route sample points og met.no spápunktar.

2. Interactive audit map þarf að sýna bæði:
   - punkt á leiðinni: point.lat / point.lon
   - met.no spápunktinn sem veðurgildin koma frá: point.forecastLat / point.forecastLon

3. Kortið á að halda bláu leiðarlínunni og route markers, en bæta við forecast-point markerum:
   - route point marker á veginum, litaður eftir mati
   - minni outlined/diamond marker á met.no spápunkti
   - ef vegpunktur og spápunktur eru meira en ca. 100-200m frá hvor öðrum, sýna mjóa connector-línu á milli
   - selected/bottom sheet þarf að sýna bæði hnitin

4. User-facing text:
   - nota "Punktur á leið" fyrir lat/lon
   - nota "Spápunktur met.no" fyrir forecastLat/forecastLon
   - bæta stuttri skýringu: "Veðurmatið notar spá fyrir þennan met.no punkt. Hann getur verið örlítið frá veginum því spáin er á hnitaneti."
   - "Skoða veðurspá" má opna veður.is/yr.no/met.no forecast view fyrir spápunktinn, ekki raw JSON sem aðalupplifun

5. Next caution:
   - halda deterministic reikningi
   - ekki setja pre-translated Icelandic reasonText í core NextCaution shape ef það er auðvelt að komast hjá því; nota reasonCode/issue og formatta í messages
   - ekki flokka no_data sem warning, en sýna sérstakt insufficient coverage state ef scannedHours er of lágt
   - ef window-mode skannar eftir latestDeparture, þarf copy að segja "eftir valda brottfarargluggann"; annars má fresta window-mode next-caution og gera single departure fyrst

6. Verification:
   - npm run type-check
   - npm run test:run

7. Localhost QA þarf sérstaklega að staðfesta:
   - route line sé rétt
   - route markers sjáist á leiðinni
   - met.no spápunktar sjáist eða komi fram við valinn punkt
   - selected details sýni bæði route coordinate og forecast coordinate
   - worst point / next caution tengist réttu hnitunum og réttri veðurspá
   - mobile view sé ekki of cluttered eða með overflow
```

## Localhost checks for Stebbi

After Claude Code implements the amended V079:

1. Open `/auth-mvp/vedrid` on localhost.
2. Run a simple route like `Garðabær -> Akranes`.
3. Confirm the result map shows the actual route line.
4. Confirm route sample points are visible on or very close to the route.
5. Tap/click a weather point.
6. Confirm the detail sheet shows:
   - point on route coordinates
   - met.no forecast point coordinates
   - weather values for the selected point
   - a normal forecast link, not raw JSON as the primary action
7. Test a route where a suspicious/worst point is not obviously on the road.
8. Confirm the UI makes it clear whether the point is:
   - the road sample point
   - the met.no forecast point used for weather values
9. Confirm green results still show when the route is actually fine.
10. Confirm green results include either:
    - next caution with time/reason, or
    - "no caution found" with an honest scan horizon, or
    - insufficient forecast coverage.
11. Check mobile widths around 360px, 390px and 430px.
12. Confirm the map, bottom sheet and buttons do not overflow or force zoom.

Do not test with production keys or production billing changes unless that is explicitly intended. Localhost browser keys and current dev setup are enough for this pass.
