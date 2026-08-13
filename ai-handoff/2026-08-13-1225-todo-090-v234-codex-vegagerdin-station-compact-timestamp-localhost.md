# TODO-090 v234 — Compact timestamp á Vegagerðarstöðvum

Created: 2026-08-13 12:25:31 +00:00
Timezone: Atlantic/Reykjavik

## 1. Plan áfangans

Bæta mjög þéttu tímamerki á sýnileg Vegagerðin-stöðvarkort þegar mæling stöðvarinnar sjálfrar er orðin 15 mínútna gömul, án þess að rugla mælitíma saman við tíma síðustu árangursríku gagnasóknar.

## 2. Hvað var raunverulega gert

- Aldur er reiknaður fyrir hverja stöð út frá `measuredAtIso` og núverandi tíma.
- Ekkert tímamerki birtist þegar mæling er yngri en 15 mínútur.
- Frá og með nákvæmlega 15 mínútum birtist tíminn hægra megin við heiti stöðvar í efstu línu kortsins.
- Mæling frá sama degi birtist sem `11:50`; mæling frá eldri degi sem `12.8. 23:50` á íslensku og `12/08 23:50` á ensku.
- Merkið er hlutlaus metadata, ekki viðvörunarlitur. Fyrirliggjandi 20 mínútna viðvörun í stöðvaglugga og 90 mínútna direct-external hegðun eru óbreytt.
- Langt stöðvarheiti fær áfram ellipsis og sameiginlega efsta línan hefur afmarkaða hámarksbreidd til að forðast overlap.
- Aðgengilegt heiti segir „Stöðvarmæling frá {time}“ / „Station measurement from {time}“.

## 3. Skrár sem voru skoðaðar

- `WORKFLOW.md`, `AGENTS.md`, `Design.md` og `ai-handoff/README.md`.
- `components/weather/RoadMapPrototypeMap.tsx` og núverandi Vegagerðin marker/detail flæði.
- `lib/weather/vegagerdinStationPresentation.ts` og tengd Vegagerðin-/korta-próf.
- Fyrri TODO-090 v233 handoff um stöðvaglugga og freshness-reglur.

## 4. Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/vegagerdinStationPresentation.ts`
- `lib/__tests__/vegagerdin-station-detail.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `messages/is.json`
- `messages/en.json`
- Þessi handoff-skrá.

Ótengda `.obsidian/workspace.json` breytingin var ekki snert.

## 5. Skipanir sem voru keyrðar

- Afmörkuð Vitest-keyrsla fyrir timestamp/detail og RoadMap live UI.
- Breiðari tengd Vitest-keyrsla fyrir Vegagerðin station, current parser og current API.
- `npm.cmd run type-check`.
- `npm.cmd run build`.
- JSON parse, `git diff --check`, diff/status yfirferð og nákvæm Reykjavík-tímastimplun fyrir handoff.

## 6. Niðurstöður og exit codes

- Fyrsta markkeyrsla: exit 0, 2 skrár / 29 próf.
- Tengd lokakeyrsla: exit 0, 5 skrár / 120 próf.
- Type-check: exit 0.
- Production build: exit 0. Aðeins fyrirliggjandi React hook/img/browser-data warnings.
- JSON parse og afmarkað diff-check: exit 0; aðeins LF/CRLF Git-viðvaranir.

## 7. Hvað mistókst eða var sleppt

- Enginn dev server eða browser var ræstur samkvæmt vinnureglum; sjónræn localhost-prófun er eftir hjá Stebba.
- Full 5.000+ prófa suite var ekki keyrð fyrir þessa litlu birtingarbreytingu. Tengd 120 prófa suite, type-check og production build voru keyrð.
- Ekkert commit, push, deploy, SQL eða production-kall var gert.

## 8. Ákvarðanir Codex

- Mælitími stöðvar er sannleikurinn fyrir merkið. `fetchedAtIso` eða „sótt successfully“ má ekki fela eldri mælingu.
- 15 mínútur er upplýsingamörk en 20 mínútur heldur áfram að vera viðvörunarmörk; þessi tvö states eru því ekki látin líta eins út.
- Dagsetning birtist aðeins ef mæling og núverandi tími eru ekki á sama almanaksdegi í `Atlantic/Reykjavik`.
- Tímamerkið var sett í fyrirliggjandi provider-línu svo marker hækki ekki og verði ekki að nýju textasvæði á kortinu.

## 9. Áhætta sem er enn til staðar

- Mjög löng stöðvarheiti styttast meira þegar timestamp birtist; fullt heiti er áfram í marker title/aria-label og detail.
- Raunveruleg MapLibre label collision og læsileiki þarf sjónræna prófun á 360/390/460 px og desktop.
- Tímamerkið uppfærist þegar stöðvagögn/marker reconciliation keyrir; enginn sérstakur mínútutimer var bætt við. Við reglulega current polling birtist það við næstu reconciliation eftir 15 mínútna mörkin.

## 10. Tillaga að næsta skrefi

Stebbi prófar 11:50-mælingu um 12:10 á localhost, ásamt ferskri stöð og stöð frá fyrri degi. Ef útlit og jaðarhegðun standast má síðar biðja sérstaklega um commit/release.

## 11. Atriði til sérstakrar rýni

- Að timestamp sjáist á bæði overview/free-drive og route Vegagerðin stöðvarkortum sem nota sameiginlega live-markerinn.
- Að 14:59 gefi ekkert merki en 15:00 gefi merki.
- Að stöðvarheiti og timestamp rekist ekki saman eða valdi horizontal overflow.
- Að 20/90 mínútna detail/external hegðun sé óbreytt.

## 12. Supabase / SQL

Engin SQL-skrá var skrifuð eða keyrð. Engar breytingar voru gerðar á Supabase, RLS, auth, grants, policies, gagnalíkani, secrets eða production-gögnum.

## 13. Localhost checks for Stebbi

1. Hafðu localhost keyrandi eins og venjulega og opnaðu Spákort eða Akstur þar sem Vegagerðin-stöðvarkort sjást.
2. Finndu stöð með mælingu yngri en 15 mínútur. Vænt: aðeins stöðvarheiti í efstu línu, ekkert tímamerki.
3. Finndu stöð með mælingu 15 mínútna eða eldri, til dæmis mælingu frá 11:50 þegar klukkan er 12:10. Vænt: lítið `11:50` hægra megin við heitið, jafnvel þótt nýjasta gagnasókn hafi tekist kl. 12:10.
4. Ef hægt er að ná nákvæmu jaðarástandi: 14:59 á ekki að sýna merki; 15:00 á að sýna það.
5. Prófaðu stöð frá fyrri degi. Vænt á íslensku: stutt dagsetning og tími, t.d. `12.8. 23:50`.
6. Smelltu á 20–89 mínútna gamla stöð. Vænt: núverandi detail-gluggi og eldri-gagna hnappur haldast óbreytt. Við 90+ mínútur á núverandi direct-external hegðun að haldast.
7. Prófaðu 360, 390 og 460 px ásamt desktop. Vænt: ekkert lárétt overflow, heiti má styttast með ellipsis, timestamp helst læsilegt og kortin skarast ekki meira en áður.
8. Prófaðu Akstur með virkri leið/live mode. Vænt: timestamp er aðeins birting og breytir ekki leið, zoomi, live tracking, völdum tíma eða stöðvasmelli.
9. Skiptu yfir á ensku. Vænt: sama-dags tími helst 24 tíma `HH:mm`; eldri dagur birtist sem `DD/MM HH:mm`; aðgengilegur titill er enskur.
10. Ekki þarf að keyra SQL og ekki á að prófa með production-gögnum eða production deploymenti fyrir þessa localhost-staðfestingu.
