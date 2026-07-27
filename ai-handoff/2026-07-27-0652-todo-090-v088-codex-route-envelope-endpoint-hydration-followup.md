# TODO-090 v088 — Route-envelope endpoint og hydration follow-up

**Agent:** Codex  
**Dagsetning:** 2026-07-27 06:52  
**Staða:** Útfært og afmörkuð sjálfvirk próf græn; bíður endurprófunar Stebba í browser.  
**Leyfi:** Framhald af skýru leyfi Stebba til að laga 503 í Teskeiðarleið og hydration mismatch á Veðurstofupunktasíðu.

## Niðurstaða

Browserpróf Stebba leiddi í ljós að v087 geometry-fixið var nauðsynlegt en ekki nægilegt. Tvær nákvæmar viðbótarorsakir fundust og voru lagfærðar:

1. Clientinn sendir full `origin`/`destination` place objects með m.a. `name`, `placeId` og `formattedAddress`. Strict route-envelope undirritarinn samþykkir viljandi aðeins canonical `{lat, lon}` endpoints. API-ið sendi fullu objectin óvart inn í undirritun og fékk því 503 þótt route geometry væri orðin bounded.
2. Fyrra hydration-fix lagaði dagslabelið, en næsta runtime-háða snið var vegalengdin `(distanceM / 1000).toLocaleString(locale)`. Server sýndi `9.2` en íslenskur browser gat sýnt `9,2`, sem hélt hydration mismatch lifandi.

API-ið normalíserar nú endpoints einu sinni eftir coordinate validation og notar þau bæði við candidate-reikning og undirritun. Pulse-vegalengd notar nú deterministic formatter sem skilar t.d. `9,2` fyrir íslensku á báðum hliðum.

## Skrár breyttar í follow-up

- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `lib/weather/pulseFormat.ts` (ný)
- `lib/__tests__/weather-route-candidate-api.test.ts`
- `lib/__tests__/pulse-format.test.ts` (ný)
- Þessi handoff-skrá.

Fyrri bounded geometry- og deterministic date-breytingar úr v087 standa óbreyttar. Engin ótengd skrá var afturkölluð og `.obsidian/workspace.json` var ekki snert af Codex.

## Öryggi og framtíðarvörn

- Extra client metadata fer ekki inn í undirritað security contract.
- Envelope bindur áfram nákvæm origin/destination coordinates og fail-closed validation er óbreytt.
- Signing catch skráir aðeins öruggan villuflokk/message á server, ekki route payload, notandaupplýsingar eða secret.
- Formatterinn treystir ekki á ICU/OS/browser locale-data í SSR hydration.

## Prófanir

- `npm run type-check`
  - Exit code 0.
- `npm run test:run -- lib/__tests__/weather-route-candidate-api.test.ts lib/__tests__/road-graph-candidate.test.ts lib/__tests__/route-option-envelope.test.ts lib/__tests__/pulse-format.test.ts lib/__tests__/chat-format.test.ts`
  - Exit code 0; 5/5 skrár og 35/35 próf græn.
- `git diff --check`
  - Exit code 0; aðeins fyrirliggjandi LF/CRLF viðvaranir.

Samkvæmt ósk Stebba var heildarprófa- og build-svítan ekki endurkeyrð fyrir þennan litla follow-up. Hún var græn í v087 og verður tekin aftur í lokayfirferð.

## Supabase, auth og production

- Engin SQL, migration, gagnabreyting, RLS-, grant-, policy-, auth-, env- eða secret-breyting.
- Engin Supabase-, Vercel-, production-, commit-, push- eða deployment-aðgerð.
- Codex ræsti eða endurræsti ekki dev server.

## Localhost checks for Stebbi

Ekki þarf heila smoke-svítu. Endurtaktu aðeins:

### A. Teskeiðarleið

1. Opnaðu `http://localhost:3004/auth-mvp/vedrid`.
2. Gerðu hard refresh.
3. Keyrðu Reykjavík → Ísafjörður með Teskeiðarleiðarflaggi.

**Vænt:** `POST /api/teskeid/weather/travel/route-candidate` skilar 200, Teskeiðarleið birtist og engin 503 sést. Leiðarlínan á áfram að fylgja vegi eðlilega.

### B. Veðurstofupunktur

1. Smelltu á Veðurstofupunkt.
2. Gerðu hard refresh á `/auth-mvp/vedrid/puls/stod/[stationId]`.

**Vænt:** Engin hydration mismatch. Dagsetning er íslensk strax og vegalengdir sjást með íslensku kommu, t.d. `9,2 km frá`.

Prófin þurfa hvorki admin refresh né SQL. Þau geta kallað á núverandi localhost route/weather providers samkvæmt `.env.local`, svo forðist aðeins óþarfa endurtekningu á Google-köllum.

## Claude Code review

Claude Code ætti sérstaklega að staðfesta:

1. Að endpoint-normalization gerist eftir coordinate validation og fyrir bæði candidate compute og signing.
2. Að signed envelope innihaldi aðeins `lat`/`lon`, án client metadata.
3. Að `formatPulseDistanceKm` samsvari íslenskri framsetningu og hafi enga SSR/client grein.
4. Að v087 geometry cap og þessi endpoint-lagfæring leysi saman raunverulega 503-keðjuna.

