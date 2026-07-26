# TODO-090/091 v022 — leiðrétt röð localhost-prófana eftir v073/v075/v021

**Created:** 2026-07-26 20:49  
**Timezone:** Atlantic/Reykjavik  
**Grunnur:** v072 localhost checklist  
**Superseding breytingar:** v073 samfelld spásaga, v075 missing-value textar, v020/v021 connectivity/bootstrap

## Leiðrétting á stöðu

Deployment-infrastructure er tilbúið, en sameinaði release-pakkinn er **ekki prerelease-grænn** fyrr en Stebbi hefur lokið browser/localhost-prófunum.

Þegar staðfest:

- SQL 84 og SQL 93 keyrð;
- met.no warmup 43/43;
- SQL 92 keyrð;
- eitt active road-graph snapshot, ekkert building, 20/20 gullleiðir, Storage object exists og bucket private.

Ekki staðfest enn:

- forecast/history browser-hegðun eftir v073/v075;
- public console/manifest;
- OTP/resend/uncertain delivery;
- route comparison/fullscreen/apply;
- candidate gate/warm/cold behavior;
- loka mobile/Safari smoke.

## Úrelt atriði úr v072 sem á ekki að prófa bókstaflega

v073/v075 supersede-a eftirfarandi v072 væntingar:

- Ekki búast við nákvæmlega sjö dögum; taflan nær frá current start að síðasta raunverulega framtíðargildi.
- Engar vinstri/hægri dagörvar; nota einn `Skoða eldri spár` hnapp.
- Tómur liðinn reitur sýnir `Sögugildi vantar`, ekki `–`.
- Tómur current/framtíðarreitur sýnir `Spá vantar`, ekki `–`.

## Rétt prófunarröð

### Áfangi 1 — spátöflan, hæsti forgangur

**Slóðir:** fyrst `/auth-mvp/vedrid`, síðan `/vedrid` signed out.

1. Velja að minnsta kosti eina Veðurstofustöð og einn Yr/met.no stað.
2. Velja `00`, `12` eða annan tíma sem er liðinn í dag.
3. Staðfesta:
   - dagurinn í dag er fyrsti default dagur;
   - current/future met.no gildi koma inn án þess að history-effect tvísendi;
   - hver pending stöð sýnir `Sæki spá...` aðeins einu sinni;
   - taflan nær að síðasta raunverulega framtíðargildi, ekki föstum sjö dögum;
   - liðinn tómur reitur segir `Sögugildi vantar`;
   - current/framtíðar tómur reitur segir `Spá vantar`;
   - engar rauðar 401/404/503 í eðlilegu flæði.
4. Smella `Skoða eldri spár` þegar hnappurinn birtist.
5. Staðfesta:
   - engar dagörvar;
   - eitt pending-state;
   - samfellt dagabil frá elsta retained degi til forecast-horizon;
   - scroll fer alveg til vinstri og focus á samanburðarsvæði;
   - hnappurinn hverfur eftir successful load;
   - eldri met.no dagar fyrir fyrstu söfnun mega sýna `Sögugildi vantar`.
6. Breyta stöðvum, tímum og viðmiðum eftir load.
   - Engar stale raðir eða gömul status-litun má leka.
7. Prófa met.no-only, Veðurstofan-only og blandað val.
8. Prófa 360, 390 og 460 px: aðeins taflan sjálf má skrolla lárétt; ekkert page overflow, zoom eða overlap.

### Áfangi 2 — public console og manifest

**Forsenda:** signed out, `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=All`.

1. Opna `/vedrid`; prófa Spágögn, Kort og Akstur Reykjavík → Ísafjörður.
2. Engar væntanlegar 401/404/503 console-villur mega koma frá public forecast/history/road-intelligence.
3. Public notandi má ekki senda Teskeið candidate request.
4. Opna `/manifest.json`; gilt JSON, ekki auth HTML.

### Áfangi 3 — OTP / innskráning

**Nota controlled test mailbox. Ekki breyta production secrets/provider config.**

1. `/innskraning`: fá fyrsta kóða og staðfesta 120 sek. niðurtalningu.
2. Reyna innan 120 sek.; fyrsti ónotaði kóðinn á áfram að virka.
3. Eftir niðurtalningu nota `Senda aftur`.
4. Ef network/gateway er óviss: amber skilaboð, ekki fölsk definitive villa.
5. Skýr provider-höfnun: rauð almenn villa og rétt skref varðveitt.
6. 360/390/460 px og iPhone Safari: ekkert input zoom, clipping eða overlap.
7. Smoke eldri admin/waitlist email ef aðgengilegt.

### Áfangi 4 — leiðasamanburður og fullscreen

**Forsenda:** innskráður route-enabled notandi og Google leiðir tiltækar.

1. Reikna leið með tveimur eða fleiri valkostum.
2. Stöðugir, ólíkir litir í korti, legendu og cards.
3. Aðeins löglegt tie má gefa fleiri en eina `Besta veðrið` merkingu.
4. Preview milli leiða á að vera tafarlaust án veður/stöðva/scrubber endurreiknings.
5. `Stækka kort`: fullscreen, X/Escape, scroll lock og safe-area.
6. `Skoða veðurskilyrði fyrir þessa leið`: þá fyrst full apply og endurreikningur.
7. Loka án apply: fyrri applied leið helst.
8. Texti nefnir rétta applied Google-leið þar til ný leið er applied.
9. 360/390/460 px: ekkert overlap eða page overflow.

### Áfangi 5 — Teskeið candidate og LKG

Infrastructure-liðir #1–#4 eru þegar staðfestir; ekki keyra SQL/bootstrap aftur.

1. Með global candidate flag og per-user `teskeid-routing-v1` virkt:
   - candidate birtist aðeins flaggaða notandanum;
   - Google er áfram fyrst/sjálfvalið.
2. Endurtaka sömu leið: warm/LKG state svarar hratt.
3. Slökkva annað gate-ið: candidate hverfur, Google virkar áfram.
4. Cold runtime eftir deploy verður síðar preview smoke; `pending` á að retry-a sjálfkrafa og ekki verða varanlegt `route_unavailable`.

### Áfangi 6 — loka-smoke

1. Public `/vedrid` og auth `/auth-mvp/vedrid`.
2. Google-only og route-enabled notandi.
3. Desktop og raunverulegur sími, sérstaklega iPhone Safari.
4. Console/Network meðan spágögn opnast, stöð bætist við, saga er sótt, leið preview-uð/applied og OTP sent/resend-að.
5. Release er blokkerað ef dagurinn í dag hverfur, rauðar expected API-villur sjást, route apply skilar ekki fullu state eða mobile overlap/zoom finnst.

## Næsta skref núna

Stebbi byrjar aðeins á Áfanga 1 og sendir niðurstöður/skjámyndir. Ekki senda pakkann í loka Claude Code prerelease-rýni fyrr en localhost-áfangar 1–5 eru annaðhvort grænir eða skýrt skráðir sem preview/post-deploy checks.

## Localhost checks for Stebbi

Þetta skjal er canonical leiðrétt localhost-checklist fyrir núverandi vinnusvæði. Byrja á Áfanga 1; engin SQL-, production-, env- eða bootstrap-endurkeyrsla er nauðsynleg fyrir hann.
