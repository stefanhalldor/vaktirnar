# TODO-091 — Valinn punktur á litla kortinu

Created: 2026-07-25 12:21  
Timezone: Atlantic/Reykjavik

## Samþykkt og framkvæmd

Stebbi samþykkti að punktasmellur á litla kortinu:

- velji punkt inni í Akstursspjaldinu
- birti „Valinn punktur“ fyrir neðan kortið
- sendi notandann hvorki á stöðvasíðu né í innskráningu
- breyti ekki zoomi kortsins

Framkvæmt:

- `DriveJourneyPanel` heldur nú local `selectedStationId`.
- Smellur á litla kortinu uppfærir aðeins þetta local state.
- Valinn Veðurstofupunktur birtist í fyrirliggjandi `VedurstofanPointCard` með `manualSelectedPointTitle`.
- Kortið fær sama stable React state-setter callback; marker-array og route-punktar breytast ekki við val, svo MapLibre-effect/`fitBounds` keyrir ekki aftur.
- Ef staða valins punkts er síuð út hverfur valda spjaldið og birtist aftur ef staðan er sýnd.
- Stóra kortið heldur óbreyttri hegðun og opnar réttar Veðurstofu-/Vegagerðarstöðvasíður.

## Skrár breyttar

- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- þessi handoff-skrá

## Checks

- `npm.cmd run type-check` — exit 0
- `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts` — exit 0, 3/3 próf
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, browserpróf, commit, push, deploy, SQL, migration eða production-breyting var framkvæmd.

## Design og route intelligence

Lausnin endurnýtir núverandi `VedurstofanPointCard`, heldur interaction innan sama mobile-flæðis og forðast óvænta navigation. Engin route-family, provider, matching-regla, persistence eða leiðargögn breyttust; `IcelandRoadmap.md` þurfti ekki uppfærslu.

## Localhost checks for Stebbi

1. Reikna leið og finna litla kortið í Akstursgögnum.
2. Skrá zoom/stöðu kortsins og smella á Veðurstofupunkt.
3. Staðfesta að:
   - engin navigation eða innskráning hefjist
   - kortið haldi sama zoomi og miðju
   - „Valinn punktur“ með réttu stöðvarheiti birtist fyrir neðan
4. Smella á annan punkt og staðfesta að spjaldið uppfærist.
5. Sía stöðu punktsins út og inn og staðfesta að punktur/spjald fylgi síunni.
6. Opna stóra kortið og staðfesta að punktar þar opni áfram réttar stöðvasíður.

Engin Supabase-, auth-, RLS- eða notendagagnabreyting fylgir.

Confidence: high í state/navigation-aðskilnaði; medium-high í viewport-hegðun þar til Stebbi hefur staðfest MapLibre canvas á localhost.
