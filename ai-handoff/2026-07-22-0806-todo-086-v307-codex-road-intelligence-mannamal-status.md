# 2026-07-22 08:06 — TODO-086 v307 — Road Intelligence staða á mannamáli

Created: 2026-07-22 08:06  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Related TODO: TODO-086 / Road Intelligence prototype  
Related recent handoffs:

- `2026-07-22-0740-todo-086-v300-codex-road-surface-loader-first-pass.md`
- `2026-07-22-0800-todo-086-v301-claude-v300-done-prerelease.md`
- `2026-07-22-0801-todo-086-v304-codex-now-first-background-route-plan.md`

## Staðan í stuttu máli

Við erum komin með virkan Road Intelligence prótótýpu-grunn undir feature flaggi.

Nýja kortið er ekki lengur bara “Google kort með punktum” heldur byrjunin á eigin Teskeiðar-korti:

- MapLibre kort er komið.
- Vegagerðar vegakerfi/færðarlínur birtast.
- Vegagerðar núgildi og Veðurstofuspá eru komin inn í nýja kortið.
- Leið er hægt að reikna og sýna á kortinu.
- Route-stöðvar eru lagðar á leiðina.
- Scrubber getur sýnt brottfarartíma / spátíma.
- Slitlagsgögn Vegagerðar eru byrjuð að nýtast til að merkja hvort leið fari um möl.
- Þetta er allt bakvið `road-intelligence-v1` og `ROAD_INTELLIGENCE_V1_ENABLED=true`.

Þetta er nógu langt komið til að vera alvöru prótótýpa, en ekki enn “loka Road OS”.

## Hvað notandinn á að upplifa næst

Markmiðið núna er að gera fyrstu upplifunina hraða og skiljanlega:

1. Notandi slær inn `Frá` og `Til`.
2. Notandi smellir á `Reikna`.
3. Sidebar lokast.
4. Teskeið sýnir loader aðeins á meðan stysta/default leið og **Núna**-veðrið er reiknað.
5. Kortið opnast strax á **Núna**.
6. Notandi sér allar stöðvar á valinni leið og vindtölu hjá þeim.
7. Scrubber neðst segir svo, án þess að loka kortinu, að Teskeið sé að reikna næstu brottfarartíma.
8. Fyrstu 24 klukkustundirnar birtast fyrst.
9. Notandi getur smellt á `Sækja meira` til að fá næsta sólarhring.
10. Á sama tíma má route-choice svæðið segja að Teskeið sé að leita að fleiri leiðum / slitlagi.

Þetta er betra en að láta notanda bíða eftir öllum leiðavalkostum, öllum slitlagsqueryum og allri spátímalínu áður en hann sér nokkuð.

## Hvað er enn að trufla upplifunina

Við höfum séð nokkrar villur/misræmi í nýja kortinu:

- Kortið getur opnast án þess að `Núna` sé nógu skýrt valið.
- Pillutalning getur sagt að það sé bara ein stöð, þó mun fleiri punktar sjáist á leiðinni.
- Sumir route-punktar fá vindtölu en ekki allir.
- Filterar/pillur geta verið í röngu state-i eftir route calculation.
- Staðarheiti á brottfararstað, áfangastað og mikilvægum stöðum á leiðinni vantar stundum.
- Stöðvaheiti væri gott að sýna hjá punktum þegar pláss leyfir.
- Full-screen loader er nú notaður aðeins of lengi fyrir hluti sem eiga frekar heima sem background skilaboð í scrubber.

Þetta eru núverandi vörugallar sem ætti að laga áður en við förum í stærri graph-routing vinnu.

## Hvað er mikilvægt að skilja tæknilega

Við erum enn ekki búin að losna við Google Routes API.

Núna er staðan:

- Google gefur enn route geometry / route options.
- Teskeið notar Vegagerðargögn ofan á það:
  - færð
  - slitlag
  - Vegagerðarstöðvar
  - raungildi núna
- Veðurstofan er notuð sem fyrsti spágrunnur fyrir framtíðar brottfarir.

Þetta er rétt sem milliskref, en ekki lokastefnan.

Lokastefnan er:

- Teskeið byggir eigin routable road graph úr opnum gögnum.
- Hver vegkafli fær eiginleika:
  - lengd
  - vegflokkur
  - slitlag
  - færð
  - nálægar veðurstöðvar
  - möguleg hættumerki síðar
- Teskeið reiknar sjálf:
  - stystu/fljótustu leið
  - leið sem forðast möl
  - leið sem forðast lokaða eða varasama vegkafla
  - hvar notandinn verður á hverjum tíma
  - hvaða veðurspá á við á hverjum stað

Þetta er “Road OS” stefnan. Við eigum ekki að festa okkur of lengi í Google-leiðabrú.

## Næsta framkvæmdarskref

Næsta skref á að vera afmarkað hotfix/UX-skref, ekki graph rewrite:

**Now-first route rendering + background 24h scrubber + route station label/count correctness**

Það þýðir:

1. Reikna default/stystu leið fyrst og sýna hana strax.
2. Opna alltaf á **Núna**.
3. Reset-a filtera þannig að allar route-stöðvar sjáist fyrst.
4. Láta pillutalningu telja sömu stöðvar og sjást á kortinu.
5. Sýna vindtölu á öllum Vegagerðarstöðvum á leið.
6. Sýna stöðvaheiti þar sem pláss leyfir.
7. Sýna brottfararstað og áfangastað alltaf ef hægt er.
8. Færa “er að reikna brottfarir á heila tímanum” úr full-screen loader yfir í scrubber.
9. Birta fyrstu 24 klst í scrubber fyrst.
10. Bæta við `Sækja meira` fyrir næsta sólarhring.
11. Leita að fleiri leiðum/slitlagi í bakgrunni eftir að fyrsta kortið birtist.

Þetta er notandagildi strax og gerir prótótýpuna miklu betri.

## Næsta stóra skref eftir það

Þegar UX hotfixið er komið og prófað:

**Open road graph phase**

Þá byrjum við að byggja grunninn til að hætta að treysta á Google Routes API:

1. Finna bestu opnu road graph uppsprettuna.
2. Normalisera vegkafla/nóður.
3. Tengja `GERD_SL` slitlag við vegkafla.
4. Tengja færð Vegagerðar við vegkafla.
5. Reikna leið sjálf með A*/Dijkstra.
6. Prófa fyrst fáar leiðir:
   - Reykjavík → Akureyri
   - Akureyri → Egilsstaðir
   - Reykjavík → Ísafjörður
   - Reykjavík → Hólmavík → Ísafjörður
7. Bera saman við núverandi Google-based niðurstöður.

Þetta er stærra verkefni og þarf eigin handoff/áfanga.

## Hvað má ekki rugla saman

Ekki segja notanda að Teskeið “finni alltaf malbikaða leið” ennþá.

Rétt orðalag núna:

- “Við erum að greina slitlag á leiðinni.”
- “Við leitum að fleiri leiðum.”
- “Ef önnur leið virðist forðast möl bjóðum við hana fram.”

Ekki rétt orðalag ennþá:

- “Teskeið finnur alltaf leið án malarvegar.”
- “Við erum hætt að nota Google Routes API.”
- “Þetta er full eigin routing-vél.”

Við viljum vera metnaðarfull en ekki lofa meira en kerfið gerir.

## Hvað Claude ætti að gera næst

Claude ætti að framkvæma v304 plan:

- Breyta submit flow þannig að `/travel` renderi fyrst.
- Keyra `/travel/routes` og road-surface query í background.
- Bæta state fyrir background route choices.
- Bæta state fyrir first 24h scrubber og `Sækja meira`.
- Laga status counts og filter reset.
- Laga Vegagerðar route labels þannig að allar vindtölur sjást á leið.
- Sýna route place labels betur.
- Keyra `npm run type-check`.
- Keyra viðeigandi targeted tests ef helperar eru dregnir út.
- Skila handoff til Codex review.

## Localhost checks for Stebbi

Opna:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Prófa eftir næstu Claude framkvæmd:

1. **Hraði fyrst**
   - Slá inn `Akureyri` → `Egilsstaðir`.
   - Smella á `Reikna`.
   - Vænt: Kortið opnast fljótt á stystu/default leið áður en allar aðrar leiðir eru fundnar.

2. **Núna fyrst**
   - Þegar kortið opnast á `Núna` að vera valið.
   - Enginn framtíðar brottfarartími á að vera sjálfkrafa valinn.

3. **Allar stöðvar á leið**
   - Telja sýnilegar stöðvar á leið.
   - Bera saman við pillurnar.
   - Vænt: Pillurnar telja sömu stöðvar og sjást.

4. **Vindtölur**
   - Vænt: Allar Vegagerðarstöðvar á leið sýna vindtölu, ekki bara ein eða tvær.

5. **Scrubber í bakgrunni**
   - Eftir að kortið er opið á ekki full-screen loader að loka kortinu.
   - Scrubber má sýna að hann sé að reikna næstu brottfarir.
   - Fyrstu 24 klst eiga að birtast fyrst.
   - `Sækja meira` á að ná næsta sólarhring ef meira er til.

6. **Leiðavalkostir í bakgrunni**
   - Vænt: Kortið birtist fyrst.
   - Svo má route-choice svæði segja að það sé að leita fleiri leiða.
   - Ef slitlag/möl finnst, birtist það eftir á án þess að loka kortinu.

Ekki prófa kæruleysislega:

- Production deploy.
- SQL.
- Breið feature flagg fyrir fleiri notendur.

Þetta er enn `road-intelligence-v1` prótótýpa.
