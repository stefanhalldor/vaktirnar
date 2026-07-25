# TODO-091 — Veðurgögn í loader-texta

Created: 2026-07-25 12:18  
Timezone: Atlantic/Reykjavik

## Samþykkt og framkvæmd

Stebbi samþykkti að Codex breytti Akstursloader-textanum:

- áður: „Raða veðurspám á rétta tímapunkta á leiðinni...“
- nú: „Raða veðurgögnum á rétta tímapunkta á leiðinni...“

Enska samsvörunin er nú „Aligning weather data with the correct times along the route...“.

## Breyttar skrár

- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Checks

- JSON parse á báðum message-skrám — exit 0
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, commit, push, deploy, SQL, migration eða production-breyting var framkvæmd.

## Localhost checks for Stebbi

1. Reikna leið í Akstri á localhost.
2. Staðfesta að loaderinn sýni „Raða veðurgögnum á rétta tímapunkta á leiðinni...“.
3. Skipta í ensku og staðfesta samsvarandi enskan texta.

Engin auth-, Supabase-, RLS-, route-domain- eða notendagagnabreyting fylgir. `IcelandRoadmap.md` þurfti ekki uppfærslu.

Confidence: high.
