# TODO #091 — Public default stations regression fix

Created: 2026-07-25 10:28  
Timezone: Atlantic/Reykjavik

## Finding

**Release-blocking regression lagað.**

Public hydration hafði verið breytt til að sleppa auth-only preferences GET.
Þegar ekkert gilt public session-draft fannst var
`weatherChasePreferenceItems` áfram `null`.

Í þessu componenti merkir:

- `null` = preferences eru enn að hlaða;
- `[]` = engar vistaðar preferences, nota canonical public defaults.

Þess vegna fékk public notandi tóma samanburðartöflu í stað default stöðva.

## Samþykkt

Stebbi gaf Codex skýrt leyfi til að laga regressionið.

Ekki samþykkt: commit, push, deploy, migration, Supabase eða
production-breytingar.

## Hvað var gert

Í public hydration branch:

- gilt session-draft heldur áfram að setja sínar stöðvar;
- ef ekkert gilt draft var endurheimt er
  `setWeatherChasePreferenceItems([])` nú kallað áður en hydration klárast;
- tómi listinn virkjar `DEFAULT_WEATHER_CHASE_ITEM_IDS`;
- auth-only preferences request er áfram sleppt, þannig að 401 console-noise
  kemur ekki aftur.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- Þessi handoff-skrá

## Checks

```text
git diff --check -- components/weather/RoadMapPrototypeMap.tsx
Exit code: 0

npm.cmd run type-check
Exit code: 0
tsc --noEmit
```

Fyrsta sameinaða check-skipunin reyndi `npm.ps1` og Windows PowerShell
execution-policy stöðvaði wrapperinn. Type-check var strax endurkeyrður með
`npm.cmd` og varð grænn. Þetta var tooling-wrapper vandamál, ekki kóðavilla.

Full Vitest suite og production build höfðu þegar orðið græn í v035 fyrir
þessa einnar-greinar state-lagfæringu:

- 135 test files passed;
- 3.598 tests passed;
- Next.js production build exit 0.

Engin sérstök automated test er til fyrir
`RoadMapPrototypeMap` public hydration.

## Localhost checks for Stebbi

Slóð:
`/auth-mvp/vedrid/road-map-prototype`

1. Opna signed-out/public í nýjum browser-tab án fyrirliggjandi
   `teskeid_weather_chase_public_session_v1`.
2. Vænt: canonical default stöðvar birtast, ekki „Veldu staði til að bera
   saman.“
3. Velja aðrar stöðvar og refresh-a í sama tab.
4. Vænt: session-stöðvarnar birtast í stað defaults.
5. Eyða sessionStorage draftinu og refresh-a.
6. Vænt: canonical defaults birtast aftur.
7. Skoða console.
8. Vænt: engin 401 frá `/preferences/chase` og engin maximum-update-depth
   villa.

## Release guidance fyrir Claude Code

Þetta handoff kemur **á eftir v035** og lagaða línan verður að vera með í
release scope.

Claude Code skal:

1. lesa v035 fyrir heildar release scope og checks;
2. lesa v036 fyrir þessa blocking regression-lagfæringu;
3. fá staðfestingu Stebba á public default-station browser check;
4. stage-a product files explicit og útiloka `.obsidian/workspace.json`;
5. commit-a/push-a/deploya aðeins samkvæmt útgáfuleyfi Stebba;
6. fylgjast með Vercel þar til deployment er grænt.

## Route intelligence check

Þetta er eingöngu public UI hydration-state fyrir public station preferences.
Engin route-, segment-, provider matching-, RLS-, Supabase- eða
production-gögn breyttust. `IcelandRoadmap.md` þarf ekki uppfærslu.

