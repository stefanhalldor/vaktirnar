# TODO #67 Vedrid - Codex decision on v044 route confirmation

Created: 2026-07-03 17:50
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi og Claude Code
Status: Decision/recommendation only. Engar kóðabreytingar, SQL, env breytingar, commit, push, deploy eða production breytingar gerðar.

Reviewed:
- `ai-handoff/2026-07-03-1810-todo-067-v044-claude-v043-analysis.md`
- `ai-handoff/2026-07-03-1732-todo-067-v043-codex-v042-phase2a3-review.md`

## Decision

Veljum **B - From/to confirmation UI**.

Claude mælti með A sem skjótustu leið, en B passar betur við product-ákvörðunina sem Stebbi tók fyrr í TODO #67: notandinn á að sjá visually að staðirnir séu réttir áður en route weather er metið. Þetta á sérstaklega við þar sem það eru margar Suðurgötur, óformleg heiti og staðarnöfn sem Google getur raðað öðruvísi en notandinn meinar.

## Rationale

B er meiri vinna núna, en sparar okkur verri UX seinna:

- Notandi fær meira traust: sér frá/til áður en Teskeiðin svarar.
- Við hættum að giska á fyrsta Google candidate.
- Við forðumst að route weather virðist “nákvæmt” á röngum stað.
- Þetta verður sama mental model og golf/unknown-place confirmation, bara með tveimur endapunktum.
- Þetta er betra fyrir app-store/mobile upplifunina: notandi fær skýra staðfestingu, ekki bara texta-villu.

## Requirements for B

Claude Code má ekki keyra route weather fyrr en bæði endpoint eru staðfest.

Implementation má vera einföld, en hún þarf að uppfylla þetta:

1. Route question parser dregur út `originText` og `destinationText`.
2. Server reynir curated `places.ts` fyrst.
3. Ef báðir endpoints eru curated: má keyra route weather beint.
4. Ef annar eða báðir endpoints eru ekki curated: API skilar structured state, ekki route weather.
5. UI sýnir route confirmation flow með tveimur stöðum:
   - Frá
   - Til
6. Fyrir óstaðfesta endpoint notar UI `PlaceSearch` eða route-specific wrapper.
7. Þegar báðir endpoints eru staðfestir sendir client:
   - `confirmedRoute.origin`
   - `confirmedRoute.destination`
8. Server validate-ar bæði coords með `validateIcelandicCoords`.
9. Server notar confirmed endpoints í `getRouteGeometry`.
10. Route weather keyrir fyrst eftir þetta.

## Scope guard

Ekki reyna að byggja fullkomið route planning UI núna.

Nóg fyrir þennan áfanga:

- Tvö einföld search/confirm controls.
- Skýr labels: frá / til.
- Engin interactive map nauðsynleg strax ef static/label confirmation er nógu skýr.
- Ekki persist-a Google candidates.
- Ekki auto-grow-a `places.ts`.
- Ekki gera Supabase admin/provider UI í þessum áfanga.

## Also fix before next handoff

Samhliða B þarf Claude enn að laga hin v043 atriðin:

1. `googleMaps.client.ts`: nota `setOptions()` + `importLibrary()` functional API, ekki `new Loader`.
2. Færa user-facing texta úr `PlaceSearch` og `MapConfirmation` í `messages/is.json` og `messages/en.json`.
3. Gera route/weather sampling caps strict.
4. Keyra `npm run type-check`.
5. Keyra targeted weather tests.

## Suggested message to Claude Code

```text
Claude Code, veljum B í v044: From/to confirmation UI.

Lagaðu v043 findings með þessari ákvörðun:
1. Route weather má ekki taka fyrsta Google geocoding candidate án staðfestingar.
2. Ef route endpoint er ekki curated í places.ts, skilaðu structured state til UI og láttu notanda staðfesta frá/til.
3. Route weather keyrir aðeins þegar bæði origin og destination eru curated eða confirmedRoute.origin/confirmedRoute.destination eru til og valid.
4. Bættu við route confirmation UI með tveimur endpointum: Frá og Til. Haltu þessu einföldu og mobile-first.
5. Ekki persist-a Google candidates og ekki auto-grow-a places.ts.
6. Lagaðu líka googleMaps.client.ts til að nota @googlemaps/js-api-loader v2 functional API: setOptions + importLibrary, ekki new Loader.
7. Færðu allan user-facing texta úr PlaceSearch/MapConfirmation/route confirmation í messages/is.json og messages/en.json.
8. Gerðu route/weather sampling caps strict.
9. Keyrðu npm run type-check og targeted weather tests.

Ekki merkja 2A4 lokið fyrr en Stebbi hefur sett inn Google lykla og localhost-prófað Phase 2A2/2A3 saman.
```

## Localhost checks for Stebbi

Þetta er ákvörðunarskjal, ekki framkvæmd. Þegar Claude skilar B-útfærslu:

1. Án Google lykla:
   - `npm run type-check` á að vera grænt.
   - Route spurning með ócurated stað á að skila skýru provider/config state, ekki crash.

2. Með Google lykla:
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Akureyri?`
     - Báðir curated, route weather má keyra beint.
   - `Er mér óhætt að keyra með hjólhýsi frá Suðurgötu að Akureyri?`
     - UI á að biðja um staðfestingu á Suðurgötu áður en route weather keyrir.
   - `Er mér óhætt að keyra með hjólhýsi frá Suðurgötu til Suðurgötu?`
     - UI á að láta staðfesta bæði frá og til, ekki giska.
   - DevTools Network:
     - `GOOGLE_MAPS_SERVER_KEY` má aldrei sjást.
   - Mobile 360/390/460 px:
     - Frá/til controls passa, input ≥16px, enginn horizontal overflow.

Ekki deploya eða opna fyrir almenna notendur fyrr en þessi confirmation-flæði hafa verið prófuð.
