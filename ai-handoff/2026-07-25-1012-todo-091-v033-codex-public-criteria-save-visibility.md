# TODO #091 — Public criteria save-button visibility

Created: 2026-07-25 10:12  
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi samþykkti að Codex breytti public UI þannig að
„Vista mínar veðurvæntingar“ birtist aðeins eftir raunverulega breytingu á
veðurvæntingagildum.

Ekki samþykkt: próf, dev-server aðgerð, commit, push, deploy, migration,
Supabase eða production.

## Hvað var gert

- Bætt var við afmörkuðu `criteriaChanged` UI-state í
  `WeatherChasePanel`.
- State verður aðeins true þegar hitastig, hámarksvindur eða hámarksúrkoma
  fær raunverulega annað normalized gildi en núverandi gildi.
- „Vista mínar veðurvæntingar“ birtist aðeins þegar public save-handler er
  til staðar og `criteriaChanged` er true.
- Staða vistunar staða/stöðva (`placesChanged`) er áfram aðskilin og óbreytt.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- Þessi handoff-skrá

Ótengdar ócommittaðar breytingar sem voru fyrir í componentinum voru
varðveittar.

## Skoðun

- `git diff --check -- components/weather/WeatherChasePanel.tsx`
  - Exit code 0.
- Engin próf, type-check, build eða dev-server aðgerð var keyrð að beiðni
  Stebba.

## Design.md

Breytingin minnkar óþarfa CTA-hávaða og birtir vistun aðeins þegar aðgerðin
hefur skýrt samhengi. Engu layouti, input-stærðum eða mobile scroll-hegðun var
breytt.

## Route intelligence check

Þetta er eingöngu local UI dirty-state. Engar leiðir, stöðvatengingar,
provider-gögn eða `IcelandRoadmap.md` atriði breyttust.

## Localhost checks for Stebbi

Slóð:
`/auth-mvp/vedrid/road-map-prototype`

Prófa signed-out/public:

1. Opna „Stilla mínar veðurvæntingar“ án þess að snerta gildin.
2. Vænt: „Vista mínar veðurvæntingar“ sést ekki.
3. Ýta einu sinni á `+` eða `-` við hitastig, vind eða úrkomu.
4. Vænt: takkinn birtist strax.
5. Refresh-a í nýju public sessioni.
6. Vænt: takkinn byrjar aftur falinn þar til gildi er raunverulega breytt.
7. Staðfesta sérstaklega að „Vista mína staði“ hegðun eftir breytingu á
   stöðvavali sé áfram óbreytt.

Engin Supabase-, auth-, RLS- eða production-prófun þarf fyrir þetta atriði.

