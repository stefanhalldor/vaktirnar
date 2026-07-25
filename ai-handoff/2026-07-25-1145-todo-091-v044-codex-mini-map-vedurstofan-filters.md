# TODO-091 — Veðurstofupillur og síur á litla kortinu

Created: 2026-07-25 11:45  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti að Codex:

- bætti Veðurstofupillum við litla leiðarkortið
- fjarlægði Vegagerðina úr litla kortinu
- skýrði að „pillurnar“ ná líka yfir stöðusíur eins og „Innan marka“

Ekki var samþykkt commit, push, deploy, migration, Supabase eða production-breyting.

## Framkvæmt

- Litla kortið hleður ekki lengur Vegagerðarvegakerfi.
- Litla kortið kallar ekki lengur í road-segment/vegfærðar-endpoint.
- Vegagerðar-attribution var fjarlægt úr litla kortinu.
- Attribution nefnir nú Veðurstofu Íslands ásamt Carto/OSM grunnkortinu.
- Hver Veðurstofupunktur hefur nú stöðvanafn í pillu yfir punktinum.
- Sömu `WindStatusFilterPills` og annars staðar í Akstri birtast yfir litla kortinu.
- Pillurnar geta meðal annars falið/sýnt „Innan marka“ og aðrar ítarlegar stöður.
- Faldar stöður fjarlægja viðkomandi punkta af litla kortinu.
- Ef valin stöð er síuð út er tengda stöðvaspjaldið einnig falið.
- Fulla Aksturskortið heldur áfram að eiga sameiginlegu Vegagerðarstillingarnar og getur sýnt Vegagerðarvegakerfi/vegfærð.

## Design.md

Endurnýttur er canonical `WindStatusFilterPills` component með núverandi touch-targets, focus-visible og semantic stöðulitum. Pillur wrap-a á mobile og kortið heldur fastri hæð án lárétts overflow.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `components/weather/DriveRouteMap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WindStatusFilterPills.tsx`

## Skrár breyttar

- `components/weather/DriveRouteMap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- þessi handoff-skrá

## Checks

- `npm.cmd run type-check` — exit 0
- `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts` — exit 0, 3/3 próf
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, browserpróf, commit, push, deploy, SQL eða migration var framkvæmd.

## Route intelligence check

Breytingin skýrir provider-skilin í UI: litla kortið sýnir Veðurstofustöðvar og fulla kortið ber valkvæð Vegagerðarlög. Engin leið, route-family, canonical segment, matching-regla, cache eða persistence breyttist. Engar ferðir eða staðsetningar eru vistaðar. `IcelandRoadmap.md` þurfti ekki uppfærslu.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid/road-map-prototype?context=route&view=information` og reikna leið.
2. Staðfesta að litla kortið sýni stöðvanöfn í pillum og attribution fyrir Veðurstofu Íslands/Carto/OSM, en enga Vegagerð.
3. Smella á „Innan marka“ og aðrar stöðusíur. Samsvarandi Veðurstofupunktar eiga að hverfa og birtast aftur.
4. Velja stöð, sía síðan stöðu hennar út og staðfesta að bæði punktur og stöðvaspjald hverfi.
5. Opna fulla kortið og staðfesta að Vegagerðarvegakerfi og vegfærð séu enn til staðar þar.
6. Prófa 360, 390 og 460 px breidd: síupillur mega ekki valda láréttu overflowi og stöðvapillur mega ekki gera kortið ósmellanlegt.

Engin Supabase-, auth-, RLS- eða notendagagnabreyting fylgir.

## Óvissa / næsta skref

Confidence: high í provider-aðskilnaði og síulógík; medium-high í marker-density þar til raunleið með mörgum stöðvum hefur verið skoðuð á localhost. Claude Code ætti að rýna hvort nafn-pillur þurfi collision-reglu á mjög þéttum leiðum fyrir útgáfu.
