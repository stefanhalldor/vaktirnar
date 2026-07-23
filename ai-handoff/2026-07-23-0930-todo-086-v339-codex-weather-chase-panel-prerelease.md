# 2026-07-23 09:30 — TODO-086 v339 — Codex weather chase panel prerelease

## Samþykki / scope

Stebbi gaf framkvæmdaleyfi fyrir fyrsta prufuskammt af nýrri **Elta veðrið**-sýn í nýja kortinu. Síðasta product-stefnan var að þetta geti verið góður aðskilnaður: þegar fólk er að skoða veðrið fái það samanburðarsýn í stað kortsins, en þegar fólk fer í akstur færist það yfir í kortið.

Ég framkvæmdi eingöngu frontend-prufuskammt. Engin SQL, engin Supabase breyting, enginn deploy, enginn commit/push.

## Plan áfangans

1. Nota núverandi Veðurstofugögn sem `RoadMapPrototypeMap` sækir nú þegar.
2. Búa til endurnýtanlegan `WeatherChasePanel` sem getur síðar tekið fleiri provider-a, t.d. Yr/met.no.
3. Tengja panelinn við nýja kortið með `🌦️` takka, þannig að hann birtist sem sérsýn yfir kortinu.
4. Halda aksturskortinu óbreyttu: `🚗` lokar veðursýn og opnar akstur.
5. Setja alla notendatexta í `messages/is.json` og `messages/en.json`.
6. Keyra type-check.

## Hvað var raunverulega gert

- Bætti við nýjum client component:
  - `components/weather/WeatherChasePanel.tsx`
- Panelinn styður:
  - valda staði
  - leit í stöðum
  - provider/source badge á hverjum stað
  - compact samanburð sem er lóðréttur fyrir 1-3 staði
  - láréttan samanburð þegar fleiri staðir eru valdir
  - drawer með sömu preset-hugsun og gamla "Skoða samanburð nánar": kl. 12, morgun/hádegi/kvöld, á 3 klst fresti
- Tengdi panelinn inn í `RoadMapPrototypeMap`:
  - nýr `🌦️` takki efst til vinstri
  - `🌦️` sýnir Elta veðrið ofan á kortinu
  - `🚗` og `💬` loka Elta veðrið svo notandi fari skýrt í akstur eða púls/spjall
- Bjó til Veðurstofu-items úr núverandi `overviewVedurstofanData`.
- Velur default-staði með nálægð við yfirlitssvæðin sem við höfum þegar skilgreint í kortinu: Ísafjörður, Reykjavík, Akureyri, Egilsstaðir, Höfn, Vík, Selfoss.
- Panelinn er provider-aware: item hefur `providerId`, `providerLabel` og `sourceLabel`, þannig að Yr/met.no eða Vegagerðin má bæta við síðar án þess að endurhanna UI-contractið.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/WeatherWatchersComparison.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/providers/vedurstofanStationExplorer.ts`
- `lib/weather/nearestStations.ts`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/README.md`

## Skrár sem voru breyttar

- `components/weather/WeatherChasePanel.tsx`
  - nýr reusable panel fyrir Elta veðrið prufusýn.
- `components/weather/RoadMapPrototypeMap.tsx`
  - bætt við WeatherChasePanel importi, Veðurstofu forecast-row mapping, default-staðavali og `🌦️` overlay-sýn.
- `messages/is.json`
  - íslenskir textar fyrir Elta veðrið í korttilraun.
- `messages/en.json`
  - enskir textar fyrir sama UI.

Ath: `RoadMapPrototypeMap.tsx`, `messages/is.json` og `messages/en.json` voru þegar dirty úr fyrri veðurpunktakortavinnu. Þessi áfangi bætti við ofangreindum hlutum, en diffið í þessum skrám inniheldur einnig eldri ócommittaðar breytingar.

## Skipanir sem voru keyrðar

- `rg ...`
  - notað til að finna núverandi Elta veðrið, comparison og prototype tengingar.
- `Get-Content ...`
  - read-only skoðun á viðeigandi skrám.
- `git status --short`
  - staðfesti dirty worktree.
- `npm run type-check`
  - exit code 0.
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - skráði staðartíma fyrir handoff filename.

## Niðurstöður og exit codes

- `npm run type-check`: exit code 0.
- Engin build/test suite var keyrð umfram type-check.
- Enginn dev server var ræstur eða endurræstur.

## Hvað mistókst eða var sleppt

- Ekki bætt við Yr/met.no sem nýjum provider í þessu skrefi.
- Ekki bætt við notendavistun á völdum Elta veðrið stöðum.
- Ekki bætt við Supabase töflu/preferences fyrir Elta veðrið.
- Ekki búið til nýtt API fyrir provider-samanburð.
- Ekki sameinað gamla `WeatherWatchersComparison` endanlega við nýja componentinn; nýi componentinn er frekar contract/prufugrunnur sem getur síðar tekið við sameiginlegri notkun.

## Ákvarðanir sem Codex tók

- Byrja á Veðurstofu Íslands, ekki Yr, því nýja kortið er nú þegar með Veðurstofu station explorer gögn og Stebbi vildi að þetta gæti síðar tekið Veðurstofugildi.
- Gera `WeatherChasePanel` provider-aware frá byrjun, svo samanburður á sama stað frá Yr og Veðurstofu verði ekki stór refactor.
- Láta `🌦️` vera sérsýn yfir kortinu frekar en lítinn panel við hliðina. Þetta fylgir nýjustu hugmynd Stebba um að veðurskoðun geti komið í stað kortsins, en akstur noti kortið.
- Ekki snerta aksturs-, route-, scrubber- eða Vegagerðarlógík í þessum áfanga.

## Design.md / UI rýni

- Search input er 16px/text-base til að forðast mobile zoom.
- Panelinn notar einfalda full-width app-sýn í stað nested card-heavy layout.
- Drawer er bottom-sheet á mobile og með `max-h` svo hann taki ekki yfir scroll stjórnlaust.
- Notendatextar fóru í `messages`.
- Engar decorative gradient/orb breytingar.

## Áhætta sem er enn til staðar

- Default-staðaval er heuristic byggt á nálægð við yfirlitssvæði, ekki sama val og vedur.is notar.
- Forecast comparison notar nearest row við föst UTC target hours. Það þarf síðar að meta hvort þetta eigi að vera local Iceland clock semantics í öllum tilvikum.
- Componentinn hefur ekki unit/integration test ennþá.
- Það er enn óákveðið hvort gamla `WeatherWatchersComparison` á að endurnýta þennan nýja component eða hvort nýi componentinn verði aðeins fyrir RoadMapPrototype fyrst.

## Tillaga að næsta skrefi

1. Stebbi prófar `🌦️` á localhost og metur hvort þetta eigi raunverulega að vera “veður í stað korts”.
2. Claude rýnir component-contractið:
   - Er `WeatherChaseItem` rétt framtíðarform fyrir provider comparison?
   - Eigum við að flytja gamla `WeatherWatchersComparison` yfir í þennan component?
3. Næsti framkvæmdaskammtur:
   - bæta við provider source vali fyrir Yr/met.no eða Veðurstofan,
   - eða bæta við vistuðu notendavali fyrir Elta veðrið staði.

## Spurningar fyrir Claude / Codex review

- Á `WeatherChasePanel` að búa til sínar eigin forecast columns, eða ætti column-builder að fara í `lib/weather` svo gamla `/vedrid` og `/ferdalagid` geti notað sama reiknigrunn?
- Eigum við að leyfa duplicate label ef provider er annar, t.d. `Akureyri · Veðurstofan` og `Akureyri · Yr`, eða þarf UI að hópa þau saman?
- Er rétt að setja veður-sýnina ofan á kortið, eða á að skipta raunverulega render-grein: weather mode = no map, drive mode = map?

## Supabase / SQL

Engin SQL var skrifuð eða keyrð.

Engin áhrif á Supabase, RLS, grants, auth, policies, functions, secrets eða production gögn.

## Localhost checks for Stebbi

Opna:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Skref:

1. Smella á `🌦️` efst til vinstri.
2. Vænt niðurstaða: kortið fær Elta veðrið-sýn yfir sig, með leitarreit, völdum stöðum og samanburðartöflu.
3. Prófa að leita að `Akureyri`, `Egilsstaðir`, `Vík` eða öðrum Veðurstofustað.
4. Smella á stað í tillögum.
5. Vænt niðurstaða: staðurinn bætist í valið og provider badge sýnir Veðurstofu Íslands.
6. Smella á valinn stað.
7. Vænt niðurstaða: staðurinn fjarlægist úr samanburði.
8. Smella á `Skoða samanburð nánar`.
9. Vænt niðurstaða: bottom-sheet opnast með preset tökkum fyrir kl. 12, morgun/hádegi/kvöld og á 3 klst fresti.
10. Smella á `🚗`.
11. Vænt niðurstaða: Elta veðrið lokast og akstursskúffa opnast; route calculation hegðun á að vera óbreytt.
12. Smella aftur á `🌦️`, svo `💬`.
13. Vænt niðurstaða: Elta veðrið lokast og púls/spjall-panel opnast.

Regression sem þarf að passa:

- Enginn horizontal page overflow á mobile viewport.
- Leit má ekki valda mobile zoom.
- Aksturskortið, `Núna`, route choices og scrubber mega ekki breytast við þessa veðursýn.
- Ef Veðurstofugögn eru enn að hlaðast þegar `🌦️` er opnað á að sjást loading texti og default val á að koma inn þegar gögnin berast.

