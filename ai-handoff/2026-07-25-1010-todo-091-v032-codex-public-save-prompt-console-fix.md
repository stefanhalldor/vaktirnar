# TODO #091 — Public save prompt and console fix

Created: 2026-07-25 10:10  
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi samþykkti að Codex bætti við „Viltu geyma veðurstillingarnar?“ fyrir
public notanda og lagaði console-villuna á meðfylgjandi localhost-skjámynd.
Stebbi bað um að engin löng próf yrðu keyrð núna.

Ekki samþykkt: commit, push, deploy, migration, Supabase eða production.

## Findings úr console

1. `Maximum update depth exceeded` var raunveruleg React-loopa. Public
   selection callback bjó til nýtt preference-state sem breytti panel-inputi,
   sem kallaði aftur á callbackið.
2. `GET .../preferences/chase 401` var væntanleg en óþörf public köllun á
   innskráðan preferences-endpoint.
3. `GET .../road-segments 401` og `road segments failed` komu vegna þess að
   public prototype kallaði á feature-gated road-segment endpoint.
4. CSS preload-warning á skjámyndinni er dev/Next warning og var ekki orsök
   React-loopunnar. Honum var ekki breytt í þessu afmarkaða verki.

## Hvað var gert

- Parent preference-state uppfærist aðeins ef röð valdra stöðva breytist.
- Signed-out hydration les public session-draft eða defaults án GET-köllunar
  á `/api/teskeid/weather/preferences/chase`.
- Public „Skrá inn og geyma“ setur pending payload beint í sessionStorage og
  fer í innskráningu án fyrst að framkalla 401 PUT.
- Public map sleppir feature-gated road-segment requestum. Authenticated
  prototype heldur núverandi hegðun.
- Eftir 25 mínútur býðst public notanda mobile-first bottom-sheet:
  - `Skrá inn og geyma`
  - `Halda áfram tímabundið`
  - X lokar og framlengir tímabundið session eins og seinni kosturinn.
- „Halda áfram“ endurnýjar 30 mínútna session-gluggann.
- Nýr notendatexti er bæði í íslensku og ensku message-skránum.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- Þessi handoff-skrá

Fyrirliggjandi ócommittaðar breytingar í þessum skrám voru varðveittar.

## Skoðanir keyrðar

- `git diff --check` á breyttum kóða og message-skrám: exit code 0.
- Bæði JSON message-skjöl lesin með `ConvertFrom-Json`: exit code 0.
- Engin test suite, type-check, build eða dev-server aðgerð var keyrð.

## Design.md

- Promptið er bottom-sheet á mobile og miðjað dialog á stærri skjá.
- Controls eru minnst 44 px há.
- Texti er stuttur, óformlegur og þýðanlegur.
- Promptið birtist ekki yfir virka kortanotkun fyrr en tímamörkin nálgast.

## Route intelligence check

Public notandi fær áfram provider-neutral veðurkort en feature-gated
road-segment lagið er ekki sótt án auth. Engin station matching, route cache,
canonical segment eða roadmap-gögn breyttust. `IcelandRoadmap.md` þarf því
ekki uppfærslu.

## Localhost checks for Stebbi

Slóð:
`/auth-mvp/vedrid/road-map-prototype`

Public/signed-out:

1. Velja aðrar veðurstöðvar.
2. Skipta úr Gögnum yfir í Kort og aftur.
3. Vænt: valið helst og engin `Maximum update depth exceeded` birtist.
4. Refresh-a í sama browser-tab.
5. Vænt: valið endurheimtist og `/preferences/chase` skilar ekki 401 í
   console.
6. Færa eða zooma kortið.
7. Vænt: `/road-segments` 401 og `road segments failed` birtast ekki.
8. Til að prófa promptið hratt má tímabundið lækka
   `PUBLIC_WEATHER_CHASE_PROMPT_DELAY_MS` á localhost. Ekki commit-a þeirri
   tímabundnu breytingu.
9. Velja `Halda áfram tímabundið`.
10. Vænt: dialog lokast, valið helst og session-glugginn framlengist.
11. Opna prompt aftur og velja `Skrá inn og geyma`.
12. Vænt: innskráning opnast og núverandi stöðvaval bíður til vistunar eftir
    login.

Authenticated regression:

1. Opna sama prototype innskráður með feature access.
2. Vænt: saved preferences hlaðast og road-segment lagið getur enn sóst.

Ekki þarf að snerta Supabase, RLS, production eða secrets í localhost-prófun.

## Óvissa / þarf að staðfesta

Engin löng eða sjálfvirk próf voru keyrð að ósk Stebba. Browserprófun þarf að
staðfesta að console-loopan sé horfin og að auth-return flow visti pending
payload eins og áður.

