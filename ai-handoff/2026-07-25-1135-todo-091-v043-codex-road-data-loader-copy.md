# TODO-091 — Vegagerðin í Akstursloader

Created: 2026-07-25 11:35  
Timezone: Atlantic/Reykjavik

## Samþykkt og framkvæmd

Stebbi samþykkti að Codex bætti „Sæki gögn frá Vegagerðinni...“ við Akstursloaderinn.

- Nýja línan var sett á eftir Google Maps leiðasókn og á undan Veðurstofugögnum.
- Enska samsvörunin er „Fetching data from the Icelandic Road and Coastal Administration...“.
- Sami textalisti er notaður af loadernum í Akstursspjaldinu og á kortinu.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Checks

- `npm.cmd run type-check` — exit 0
- JSON parse á báðum message-skrám — exit 0
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, commit, push, deploy, SQL, migration eða production-breyting var framkvæmd.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid/road-map-prototype?context=route&view=information`.
2. Reikna leið.
3. Staðfesta að loaderinn sýni nýju Vegagerðarlínuna ásamt hinum þremur textunum og að textinn flæði ekki út á mobile.

Engin Supabase-, auth-, RLS- eða notendagagnabreyting fylgir.

## Route intelligence check

Aðeins loading-copy breyttist. Engri leið, vegkaflaþekkingu, provider-kalli, cache eða persistence var breytt; `IcelandRoadmap.md` þurfti því ekki uppfærslu.

Confidence: high.
