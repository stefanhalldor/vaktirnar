# v077 — Magnslider tilbúinn fyrir localhost

Created: 2026-09-16 23:08
Timezone: Atlantic/Reykjavik

## Plan áfangans

Skipta aðalstýringu magns út fyrir slider sem vinnur með heil stykki, sýna magn
sem aðrir hafa tekið sem læstan enda og sameina nákvæman innslátt undir
þrískiptingunni Magn, Prósenta og Brot. Slider má ekki senda mutation meðan
fingur eða mús er enn á controlinu.

## Hvað var raunverulega gert

- Slider uppfærir staðbundið sýnilegt gildi við hverja hreyfingu.
- Claim er sent við `pointerup` eða við lok viðeigandi lyklaborðsaðgerðar.
- `pointercancel` endurheimtir vistað magn án mutation.
- Hámark slider er eigið vistað magn auk þess sem er enn laust.
- Magn annarra birtist sem skyggður, læstur endi og í texta.
- `Annað magn` notar eitt þrískiptingarval: Magn, Prósenta og Brot.
- Magn, prósenta og brot yfirskrifa áfram allt eigið magn og mega ekki fara yfir
  það sem er laust eftir þegar magn annarra er tekið frá.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `../WORKFLOW.md`
- `Design.md`
- `components/receipt-split/SplitBoardV2.tsx`
- `lib/receipt-split/quantity-v2.ts`
- nálæg UI- og domain-próf
- `messages/is.json` og `messages/en.json`

## Skrár sem voru breyttar

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `messages/is.json`
- `messages/en.json`
- canonical task-skjal og þetta handoff

## Skipanir og niðurstöður

- Focused Vitest: 3 skrár, 24/24 próf PASS, exit 0.
- `npm run type-check`: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- `npm run build`: PASS, exit 0. Aðeins eldri ótengdar warnings birtust.
- `git diff --check`: PASS.

## Hvað mistókst eða var sleppt

Fyrsta prófunarkeyrsla sá ekki dependency úr einangraða worktree-inu. Læst
dependency-tré var sett upp með `npm ci --ignore-scripts` og prófin keyrð aftur.
Enginn dev server var ræstur og engin browserprófun var framkvæmd af Codex.

## Ákvarðanir

- Native range-control er notað svo lyklaborð, focus og skjálesari haldist.
- Slider notar skrefið eitt heilt stykki. Fyrra brotamagn má sjást sem núverandi
  gildi; næsta sliderhreyfing smellur á heilt stykki.
- Server-authoritative capacity- og conflict-vörn er óbreytt.
- Lausnin fylgir `Design.md`: mobile-first, minnst 44 px controlhæð, sýnilegt
  label, semantic litir, focus/keyboard stuðningur og enginn nýr nested card.

## Áhætta sem er enn til staðar

- Native slider-útlit er örlítið ólíkt milli iOS Safari og Android/Chromium.
- Sjónræn samskeyti milli virka hluta stikunnar og læsta endans þarf raunverulega
  farsímarýni.
- Concurrent claim frá öðrum getur enn valdið eðlilegu server conflict eftir að
  notandi byrjar að draga; núverandi refresh/error-flæði sér um það.

## Tillaga að næsta skrefi

Stebbi prófar candidate á localhost. Eftir staðfestingu þarf sérstakt leyfi fyrir
commit, push eða production útgáfu.

## Atriði fyrir Codex-rýni

- Staðfesta að aðeins ein mutation fari af stað þegar slider er sleppt.
- Staðfesta að hámark og læsti hluti stemmi við magn annarra.
- Staðfesta að þrískiptingin passi við 360 px án overflow.

## Supabase

Engin SQL-skrá var búin til eða keyrð. Gögn, RLS, auth, policies, functions og
production eru óbreytt.

## Localhost checks for Stebbi

1. Opnaðu reikning í skiptingu á localhost með innskráðum þátttakanda.
2. Prófaðu fyrst lið með 13 stk. þar sem annar þátttakandi hefur tekið 3.
   Vænt: slider fer mest í 10 og síðustu 3 sjást læst á enda stikunnar.
3. Dragðu slider hægt fram og til baka. Vænt: talan breytist strax, en netbeiðni
   og vistun eiga sér fyrst stað þegar fingri er sleppt.
4. Opnaðu `Annað magn`. Vænt: þrír jafnir valkostir, Magn, Prósenta og Brot,
   og aðeins viðeigandi innsláttur og vistunarhnappur sjást hverju sinni.
5. Prófaðu að Magn, Prósenta og Brot yfirskrifi fyrra eigið magn og geti ekki
   farið yfir laust magn eftir að magn annarra hefur verið tekið frá.
6. Prófaðu slider með lyklaborðsörvum. Vænt: gildið vistast við keyup og focus
   sést greinilega.
7. Prófaðu við 360, 390 og 460 px, sérstaklega iPhone/Safari ef tiltækt. Passaðu
   að enginn texti eða control flæði lárétt og að touch thumb sé auðvelt að nota.
8. Prófaðu lið þar sem eigið magn er brot, til dæmis 1/2. Vænt: vistaða talan
   birtist rétt; sliderinn færist síðan í heilum stykkjum en nákvæm brot eru áfram
   skráð undir `Annað magn`.

Ekki þarf að keyra SQL eða prófa production fyrir þessa localhost-gátt.
