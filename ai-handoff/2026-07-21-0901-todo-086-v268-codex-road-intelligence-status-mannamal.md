# 2026-07-21 09:01 - TODO 086 - v268 - Codex Road Intelligence status á mannamáli

## Tilgangur

Stebbi bað um einfalt handoff um hvar Road Intelligence verkefnið stendur núna, á mannamáli, og sérstaklega:

> Hvenær get ég farið að setja inn að ég sé að fara frá Reykjavík til Akureyri og við reiknum fjarlægð leiðar og setjum niður á veðurstöðvarnar m.v. hvenær við erum á hverjum stað, eins og við gerum nú í `/ferdalagid`, en á nýja grunninum okkar?

Þetta skjal er stöðumat og næstu skref. Enginn kóði var breyttur í þessu handoffi.

## Stutta svarið

Við erum ekki komin á þann stað enn að nýi grunnurinn geti sjálfur reiknað Reykjavík → Akureyri leið og raðað veðurstöðvum eftir tíma á leið.

Við erum komin með fyrstu mikilvægu undirstöðuna:

1. Nýtt MapLibre-kort birtist.
2. Kortið notar okkar eigin prototype-route bakvið feature flagg.
3. Vegagerðarstöðvar birtast sem punktar.
4. Vegagerðar færðarsegment birtast sem lituð road-condition lög.
5. Við erum byrjuð að normalisera opin Vegagerðar-gögn yfir í Teskeið-eigin properties.

Það sem vantar áður en Stebbi getur slegið inn Reykjavík → Akureyri á nýja grunninum:

1. Eigin routeable vegagrunnur eða a.m.k. provider-neutral route graph.
2. Snapping frá stað/hniti yfir á næsta vegkafla.
3. Route algorithm yfir vegkafla.
4. Lengd og cumulative distance eftir leið.
5. ETA/speed model.
6. Projection á veðurstöðvar niður á leið.
7. Tímaútreikningur: “við verðum hjá þessari stöð kl. X”.
8. UI sem sýnir þetta á MapLibre-kortinu.

## Hvar Við Stöndum Núna

### Núverandi gamla kerfið

`/ferdalagid` getur í dag gert nothæfa ferðaveðurupplifun:

- Stebbi setur inn frá/til.
- Google route kemur til baka.
- Við finnum stöðvar við leið.
- Við getum metið stöðvar eftir röð/fjarlægð.
- Við sýnum veður eftir leið.

Gallinn:

- Leiðagrunnurinn er að miklu leyti Google-driven.
- Við viljum ekki byggja alla framtíðar Road Intelligence á Google-specific route memory og geometry.
- Google er góður provider/fallback, en ekki endanlegur kjarni ef markmiðið er Live Road OS.

### Nýi grunnurinn

Nýi Road Intelligence grunnurinn er kominn í “kort + lifandi opið vegalag” stöðu:

- MapLibre virkar sem nýr kortgrunnur.
- Við getum birt open-data road layers.
- Við getum birt Vegagerðarstöðvar.
- Við getum sótt Vegagerðin Færð-lög í gegnum okkar API proxy.
- Við getum litað road segments eftir færðargögnum.

Þetta er mjög mikilvægt skref, en þetta er enn ekki route engine.

Mannamálsmunurinn:

- Núna: “Við sjáum vegina og stöðurnar.”
- Næst: “Við skiljum vegina sem tengt net.”
- Svo: “Við getum reiknað leið.”
- Svo: “Við getum sagt hvenær þú ert nálægt hverri veðurstöð.”

## Hvenær Kemur Reykjavík Til Akureyri Á Nýja Grunninum?

Ég myndi skipta þessu í þrjár útgáfur.

### Útgáfa 1 - brú yfir úr gamla kerfinu

Þetta er hraðasta leiðin til að sjá eitthvað notendasýnilegt:

- Notandi setur inn Reykjavík → Akureyri í nýja Road Intelligence UI.
- Við notum tímabundið núverandi `/ferdalagid` route/station logic sem input.
- Við birtum niðurstöðuna á nýja MapLibre-kortinu.
- Við byrjum að bera hana saman við nýju Vegagerðarsegmentin.

Þetta væri ekki fullur “nýi grunnurinn”, en væri góð vörubrú. Stebbi gæti séð nýja kortið, stöðvar eftir leið og ferðaveðurhegðun mjög fljótt.

Kostur:

- Hratt.
- Notandinn sér gagnsemi strax.
- Við getum prófað UI/UX án þess að bíða eftir fullum route engine.

Galli:

- Route-útreikningurinn væri enn að hluta byggður á gamla `/ferdalagid` grunninum.
- Þetta má ekki rugla okkur í að halda að eigin route engine sé tilbúinn.

### Útgáfa 2 - fyrsti eigin route graph MVP

Þetta er fyrsta alvöru “nýi grunnurinn”:

- Við veljum routeable open-data vegagrunn.
- Við normaliserum vegkafla í okkar eigin format.
- Við geymum eða cache-um vegkafla með stable IDs, geometry, lengd og tengingum.
- Við byggjum einfaldan graph.
- Við getum reiknað eina leið milli tveggja staða.

Þegar þetta er komið, þá getur Stebbi byrjað að setja inn Reykjavík → Akureyri og fá leið sem er raunverulega reiknuð á okkar eigin grunni.

En til að þetta verði jafn gagnlegt og `/ferdalagid` þarf strax næsta skref líka.

### Útgáfa 3 - eigin route + veðurstöðvar + ETA

Þetta er það sem Stebbi lýsir nákvæmlega:

- Reykjavík → Akureyri fer inn.
- Við reiknum leið á okkar grunni.
- Við reiknum cumulative distance eftir route.
- Við finnum veðurstöðvar nálægt route.
- Við vörpum hverri stöð niður á næsta punkt á leið.
- Við reiknum hvenær notandi verður líklega hjá stöðinni.
- Við veljum rétt veðurspágildi miðað við þann tíma.
- Við birtum stöðvar á kortinu og í timeline.

Þetta er fyrsti punkturinn þar sem nýi grunnurinn er orðinn sambærilegur við `/ferdalagid` í ferðaveðurvirkni.

## Mín Tillaga Um Röð

Ég myndi ekki hoppa beint í fullkominn route engine án vörubrúar. Ég myndi heldur ekki stoppa of lengi í brú sem notar Google/gamla grunninn.

Besti takturinn:

1. Klára og staðfesta v267:
   - MapLibre virkar.
   - Færðarlituð segment virka.
   - Popup virkar.
   - Rétt Færð-layer er notað.

2. M3A - Route UI bridge:
   - Bæta við route input í Road Intelligence prototype.
   - Leyfa Reykjavík → Akureyri.
   - Nota gamla `/ferdalagid` niðurstöðu sem tímabundna “truth source”.
   - Birta leið/stöðvar á nýja MapLibre-kortinu.
   - Merkja þetta sem bridge, ekki endanlegan route engine.

3. M3B - Open route graph discovery/prototype:
   - Claude Code/Codex staðfesta hvaða opni vegagrunnur hentar best sem routeable graph.
   - Við þurfum sérstaklega að passa að gögnin hafi tengingar eða að við getum byggt þær sjálf.
   - Útkoma: route graph prototype sem getur reiknað simple route milli tveggja hnita.

4. M3C - Station projection á nýja route graph:
   - Endurnýta hugmyndafræðina úr `/ferdalagid`.
   - Gera hana provider-neutral og route-graph based.
   - Reikna distance along route og ETA fyrir hverja stöð.

5. M3D - Weather timeline:
   - Tengja ETA við Veðurstofu-spá og Vegagerðar-raungildi.
   - Sýna “hvenær þú hittir hvaða veður”.

Eftir M3C/M3D er Stebbi kominn með alvöru Reykjavík → Akureyri ferðaveður á nýja grunninum.

## Hvað Claude Code Ætti Að Passa Núna

Claude Code ætti ekki að fara strax að smíða stóran, fullkominn route engine nema búið sé að staðfesta gagnagrunninn.

Næsta skref ætti að vera annað hvort:

1. Reviewa og prófa v267 vel.
2. Ef v267 er heilbrigt, byrja M3A route bridge svo Stebbi sjái Reykjavík → Akureyri fljótt á nýja kortinu.
3. Samhliða eða næst á eftir: gera M3B open route graph spike, þar sem markmiðið er ekki UI heldur að sanna að við getum reiknað route án Google.

Þetta heldur bæði hraða og réttri framtíðarstefnu.

## Route Intelligence Check

Leiðir sem þetta snertir:

- Allar Íslandsleiðir til framtíðar.
- Sérstaklega route families eins og Reykjavík → Akureyri, Reykjavík → Egilsstaðir, Reykjavík → Ísafjörður.

Á þetta heima í `IcelandRoadmap.md` eða `lib/iceland-routes/`?

- Já.
- Öll route graph, station projection, control points, canonical route families og provider-neutral route scoring eiga að enda sem sameiginlegur kjarni, ekki sem sérlausn inni í `RoadMapPrototypeMap.tsx`.

Provider-neutral?

- M3A route bridge má tímabundið nota gamla `/ferdalagid`/Google-driven niðurstöðu.
- M3B og áfram þurfa að vera provider-neutral eins mikið og hægt er.
- Vegagerðin má vera provider fyrir færð og raungildi.
- Veðurstofan má vera provider fyrir spá.
- Google má vera fallback/samanburður, ekki kjarni.

Þarf að uppfæra canonical segment/control-point gögn?

- Já, þegar M3B hefst.
- Þá þarf líklega sérstakt handoff um hvernig open route graph verður skráður, hvort í `lib/iceland-routes/`, Supabase/PostGIS, static generated artifacts eða blöndu.

## Áhætta

Stærsta áhættan er að rugla saman tveimur hlutum:

1. Kort sem sýnir vegi.
2. Kerfi sem skilur vegi sem routeable graph.

Við erum komin með fyrra. Við erum ekki komin með seinna.

Önnur áhætta:

- Ef við byggjum M3A of vel á gamla `/ferdalagid`, gætum við fest brúna sem framtíðarkerfi.
- Ef við förum beint í fullan route engine án UI-prófunar, gætum við eytt mörgum implementation-hringjum án þess að Stebbi geti prófað vörugildi.
- Ef við veljum rangt open-data source fyrir route graph, gæti topology/road connectivity orðið vandamál.

## Skýr Næsta Ákvörðun Fyrir Stebba

Stebbi þarf að velja næstu vinnulínu:

1. Hraðari vörubrú:
   - “Látum Reykjavík → Akureyri birtast á nýja MapLibre-kortinu með gamla `/ferdalagid` route logic sem input.”

2. Tæknilega hreinni grunnur fyrst:
   - “Byrjum á route graph spike og reynum að reikna Reykjavík → Akureyri án Google áður en við gerum UI.”

Mín ráðlegging:

Fara í bæði, en í réttri röð:

1. M3A bridge fyrst, mjög afmarkað og merkt sem tímabundið.
2. M3B route graph spike strax á eftir.
3. Ekki gefa bridge-ið út sem “nýja route engine”.

Þetta gefur Stebba eitthvað að prófa fljótt, án þess að fórna framtíðarstefnunni.

## Localhost Checks For Stebbi

Þetta handoff breytir ekki kóða og bætir ekki við nýju localhost-prófi.

Áður en næsta framkvæmd hefst ætti Stebbi samt að prófa núverandi stöðu:

1. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype` eða rétt port hjá Stebba.
2. Staðfesta að kortið birtist.
3. Staðfesta að stöðvapunktar birtist.
4. Staðfesta að lituð færðarsegment birtist eftir v267.
5. Smella á vegsegment og sjá lítið popup.
6. Prufa `Fela vegakerfi` og sjá hvort bæði raster vegakerfi og lituð segment hverfa.

Það er ekki enn hægt að prófa Reykjavík → Akureyri route input á nýja grunninum, því það UI og route graph eru ekki komin.

Ekki keyra SQL, breyta Supabase feature flags, env vars, production data eða deploya út frá þessu handoffi nema Stebbi gefi sérstakt leyfi.

## Fyrir Claude Code

Claude Code: þegar þú færð þetta, vinsamlegast rýndu sérstaklega:

1. Er M3A bridge góð hugmynd eða ætti Stebbi að sleppa henni og fara beint í M3B route graph?
2. Hvaða open-data road source er líklegast best fyrir routeable graph?
3. Þarf route graph að fara í Supabase/PostGIS strax, eða má fyrsta spike vera generated local artifact í repo?
4. Hvernig getum við endurnýtt station projection úr `/ferdalagid` án þess að draga Google-specific assumptions með okkur?
5. Hver er minnsta framkvæmd sem gerir Stebba kleift að prófa Reykjavík → Akureyri á nýja kortinu án þess að plata okkur um að eigin route engine sé tilbúinn?
