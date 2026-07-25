# TODO #091 — Public station selection session draft

Created: 2026-07-25 10:04  
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi samþykkti afmarkaða localhost-kóðabreytingu sem heldur völdum
veðurstöðvum public notanda inni þegar skipt er milli Gagna og Korts í
Akstrinum. Stebbi bað sérstaklega um að prófanir yrðu ekki keyrðar núna.

Samþykktin náði ekki til commit, push, deploy, migration, Supabase eða
production-breytinga.

## Hvað var gert

- Public stöðvaval er nú fært upp í núverandi parent-state þegar
  `WeatherChasePanel` birtir breytingu. Því getur panelinn unmountast við
  kortaskipti og mountast aftur með sama vali.
- Sama afmarkaða val er vistað í `sessionStorage` fyrir núverandi browser-tab.
- Session-draftið geymir `updatedAt` og er aðeins endurheimt við hydration ef
  það er yngra en 30 mínútur. Eldra eða ógilt draft er fjarlægt.
- Innskráðir notendur halda áfram að nota núverandi server-side preferences;
  public draftið er aðeins virkt þegar `isAuthenticated` er false.
- Ef browser-storage er lokað heldur parent-state samt valinu við venjuleg
  Gagna/Kort flipaskipti á lifandi síðu.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- Þessi handoff-skrá

Athugið að aðrar ócommittaðar breytingar voru fyrir í
`RoadMapPrototypeMap.tsx` og öðrum weather-components. Codex afturkallaði þær
ekki og breytti aðeins session-state hlutanum.

## Skipanir og niðurstöður

- Read-only `rg`, `Get-Content`, `git status` og `git diff` til skoðunar.
- `git diff --check -- components/weather/RoadMapPrototypeMap.tsx`
  - Exit code 0.
  - Engin whitespace-villa fannst.
- Engin test suite, type-check, build eða dev server var keyrður samkvæmt
  beiðni Stebba.

## Áhætta og edge cases

- 30 mínútna TTL er metið við endurhleðslu/hydration. Lifandi síða hendir
  ekki vali út undan notanda eftir 30 mínútur; það er viljandi svo virkt
  Aksturs-session brotni ekki.
- `sessionStorage` er browser-tab bundið og fer ekki sjálfkrafa milli
  sjálfstæðra taba.
- Ef storage er bannað eða fullt lifir valið aðeins meðan núverandi
  `RoadMapPrototypeMap` instance er mountað.
- Engin gögn, RLS, auth, grants, functions eða production voru snert.

## Route intelligence check

- Breytingin snertir aðeins tímabundið UI-val veðurstöðva í Akstrinum.
- Engin ný leið, vegkaflaþekking, station-matching regla, cache lykill eða
  persónuleg ferðagögn eru búin til.
- `IcelandRoadmap.md` og `lib/iceland-routes/` voru því ekki uppfærð.

## Design.md

Lausnin varðveitir stöðugt state við navigation milli innri Gagna/Kort viewa
og kemur í veg fyrir að mobile control virðist hafa gleymt vali. Engu layouti,
input-stærð, loader eða mobile scroll-hegðun var breytt.

## Localhost checks for Stebbi

Slóð: localhost-síðan þar sem public notandi opnar Aksturinn /
Road Intelligence kortið.

Forsenda: prófa signed-out/public, helst í nýjum browser-tab svo gamalt
sessionStorage rugli ekki fyrstu niðurstöðu.

1. Opna Gögn í Veður- eða stöðvahlutanum.
2. Fjarlægja eina sjálfgefna stöð og bæta við annarri stöð.
3. Skipta yfir í Kort.
4. Skipta aftur yfir í Gögn.
5. Vænt: nákvæmlega sama stöðvaval er enn inni.
6. Refresh-a síðuna strax.
7. Vænt: sama stöðvaval endurheimtist í sama browser-tab.
8. Opna síðuna í nýjum browser-tab.
9. Vænt: public draft flyst ekki sjálfkrafa yfir í nýja tabið.
10. Staðfesta að innskráður notandi fái áfram sín server-vistuðu defaults og
    að public session-draft yfirskrifi þau ekki.

Við útgáfu þarf einnig að prófa útrunnið draft með `updatedAt` eldra en
30 mínútur, storage-blocked fallback og mobile flipaskipti. Engin sérstök
Supabase-, auth-, RLS- eða production-prófun er heimiluð af þessari breytingu.

## Næsta skref

Stebbi sannreynir flæðið á localhost. Við útgáfu keyrir Claude Code/Codex
viðeigandi type-check og afmörkuð próf eftir nýju skýru leyfi.

