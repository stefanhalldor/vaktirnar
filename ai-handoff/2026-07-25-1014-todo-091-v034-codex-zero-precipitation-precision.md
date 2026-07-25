# TODO #091 — Zero precipitation threshold precision

Created: 2026-07-25 10:14  
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi samþykkti að Codex sýndi fleiri aukastafi í samanburðartöflunni þegar
hámarksúrkomumörk eru `0` og lítil jákvæð úrkoma myndi annars birtast sem `0`.

Ekki samþykkt: próf, dev-server aðgerð, commit, push, deploy, migration eða
production.

## Hvað var gert

- Venjuleg úrkomubirting er áfram í einum aukastaf.
- Þegar úrkomumörkin eru nákvæmlega `0`:
  - gildi frá `0,01` upp að `0,09` birtast með tveimur aukastöfum;
  - jákvæð gildi undir `0,01` birtast sem `<0,01`;
  - raunverulegt núll birtist áfram sem `0`.
- Þannig sést af hverju lítið jákvætt gildi grámast þegar mörkin eru núll.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- Þessi handoff-skrá

Ótengdar ócommittaðar breytingar voru varðveittar.

## Skoðun

- `git diff --check -- components/weather/WeatherChasePanel.tsx`
  - Exit code 0.
- Engin próf, type-check, build eða dev-server aðgerð var keyrð samkvæmt
  fyrirmælum Stebba.

## Design.md

Breytingin bætir skýrleika í sama töflureit án nýrra controls, layout-breytinga
eða mobile overflow-áhættu.

## Route intelligence check

Þetta er aðeins formatting á fyrirliggjandi forecast-gildi. Engin
route/station matching, provider-lógík eða roadmap-gögn breyttust.

## Localhost checks for Stebbi

Á public Akstursskjánum:

1. Setja hámarksúrkomu í `0`.
2. Finna töflureit með lítilli jákvæðri úrkomu undir `0,1 mm/klst`.
3. Vænt: `0,01`–`0,09` birtist með tveimur aukastöfum og gildi undir `0,01`
   sem `<0,01`, ekki villandi `0`.
4. Vænt: gildið grámast áfram vegna þess að það er yfir núllmörkunum.
5. Finna raunverulegt núll.
6. Vænt: það birtist sem `0 mm/klst` og grámast ekki vegna úrkomumarkanna.
7. Breyta hámarksúrkomu í annað gildi en `0`.
8. Vænt: venjuleg eins aukastafs birting helst.

Engin Supabase-, auth-, RLS- eða production-prófun þarf.

