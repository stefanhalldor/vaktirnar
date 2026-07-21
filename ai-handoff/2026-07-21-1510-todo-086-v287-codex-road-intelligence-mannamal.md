# 2026-07-21 15:10 - TODO 086 v287 - Road Intelligence staða á mannamáli

Created: 2026-07-21 15:10
Timezone: Atlantic/Reykjavik

## Hvað er staðan núna?

Við erum komin með fyrstu alvöru útgáfu af nýja Road Intelligence kortinu sem hliðarleið á feature flaggi.

Þetta er ekki komið í staðinn fyrir gamla `/ferdalagid`, en það er farið að gera það sem við vildum sanna:

- nota okkar eigið MapLibre kort í stað Google-korts
- sýna vegakerfi og vegfærðarlag
- taka inn `Frá` og `Til`
- reikna ferðaleið með núverandi ferðaveður-API
- leggja veðurstöðvar á leiðina
- nota Vegagerðina og Veðurstofuna sem íslensku providerana
- leyfa notanda að stilla eigin vindmörk
- sýna hvort leiðin er innan marka, óþægileg eða hættuleg
- láta scrubber/tímalínu breyta stöðu leiðarinnar eftir brottfarartíma

Það sem var bætt í síðustu Codex lotu:

- Veðurstofu vindtölur sjást nú á kortinu án þess að smella.
- Of margar grænar Veðurstofu-labels eru takmarkaðar á löngum leiðum.
- Rauðar/appelsínugular stöðvar halda áfram að sjást strax.
- Fyrsta og síðasta Veðurstofustöð á langri leið eru notaðar sem leiðar-anchors.
- Kortið sýnir nú sjálft hvort þú sért að skoða `Núna` eða valinn brottfarartíma úr scrubber.
- Vegagerðar- og Veðurstofu-labels deila nú sama grunn-helper, svo við breytum útliti/hegðun á einum stað næst.

## Hvernig birtist þetta notandanum?

Notandi fer á:

`/auth-mvp/vedrid/road-map-prototype`

Þar slær hann inn:

`Reykjavík` -> `Akureyri`

Þá á hann að sjá:

1. Kort með leiðarlínu.
2. Vegakerfi og vegfærð yfir Íslandi.
3. Vindtölur á mikilvægum veðurstöðvum á leiðinni.
4. Stöðu-pillur undir samantekt:
   - Innan marka
   - Óþægilegt
   - Hættulegt
5. Scrubber sem leyfir að velja brottfarartíma.
6. Þegar hann velur annan tíma breytist:
   - status badge
   - stutta svarið
   - Veðurstofu-gildin á kortinu
   - litla tímamerkið á kortinu

Mikilvægasta breytingin í upplifun:

> Kortið er farið að vera lifandi ferðakort, ekki bara yfirlitskort með punktum.

## Hvað er enn ekki komið?

Við erum ekki enn komin með fulla “ég er að keyra frá Reykjavík til Akureyrar og kerfið reiknar nákvæmlega hvenær ég verð hjá hverri stöð” upplifun á alveg nýjum grunni.

Við erum nálægt henni, en þrjú stór atriði eru eftir:

1. **Leiðargæði**
   - Kortið þarf að fylgja vegum 100% trúverðugt.
   - Við þurfum að greina hvort frávik koma frá Google route geometry, einföldun á línu, okkar birtingu eða station-matching.

2. **Stöðva- og kaflamatching**
   - Við erum farin að nota provider-stöðvar með route-fraction og distance.
   - Næst þarf að gera þetta enn “veglegra”: tengja stöðvar og veðuráhrif betur við vegkafla.

3. **Road OS ákvarðanir**
   - Nú er þetta prototype sem hjálpar okkur að sjá leiðina.
   - Næst þarf það að verða ráðgefandi:
     - hvaða kafli er varasamur?
     - hvenær kemur notandinn þangað?
     - er betra að fara fyrr eða seinna?
     - þarf að vara sérstaklega við ákveðnum kafla?

## Hvað er næsta eðlilega skref?

Næsta stóra skref ætti að vera route quality og route-station trust.

Á mannamáli:

> Nú þegar kortið sýnir tölur og tíma þurfum við að tryggja að leiðin sjálf sé rétt og að veðurstöðvarnar sitji á réttri ferðasögu.

Mælt næsta skref fyrir Claude Code:

1. Prófa nokkrar canonical leiðir:
   - Reykjavík -> Akureyri
   - Akranes -> Akureyri
   - Ísafjörður -> Reykjavík
   - Reykjavík -> Egilsstaðir

2. Fyrir hverja leið:
   - bera leiðarlínu saman við vegakerfið
   - skoða hvort hún fylgir vegi eða sker land/óvegi
   - skoða hvort veðurstöðvar raðast eðlilega eftir akstursröð
   - skoða hvort route-fraction skilar sannfærandi “hvenær er ég hjá stöðinni”

3. Skrá niður hvort vandinn er:
   - route geometry
   - visual rendering
   - station projection
   - provider-data
   - eða einfaldlega vænting um annan route option

## Hvernig spilast þetta út í skrefum?

### Skref 1 - núna

Við prófum nýja kortið á feature flaggi.

Notandi sér leið, veðurstöðvar, vindtölur og tíma.

### Skref 2 - næst

Við gerum leiðina traustari.

Það þýðir að leiðarlínan þarf að passa vegina og stöðvarnar þurfa að raðast rétt meðfram leiðinni.

### Skref 3

Við tengjum þetta betur við vegkafla.

Þá getur Teskeið farið að segja:

“Þessi kafli á leiðinni er að verða óþægilegur um það leyti sem þú kemur þangað.”

### Skref 4

Við byrjum að ráðleggja brottfarartíma.

Ekki bara:

“Veðrið er svona.”

Heldur:

“Ef þú ferð kl. 12 lendirðu í þessum vindi, ef þú ferð kl. 15 er leiðin betri.”

### Skref 5

Þá verður þetta raunverulega Live Road OS:

- vegir
- veður
- raungildi
- spá
- tími
- leiðarkaflar
- ákvörðun fyrir notandann

## Hvað er tilbúið til að sýna?

Sem prototype fyrir Stebba og Claude Code:

- Já, þetta er komið nógu langt til að prófa á localhost.

Sem production replacement fyrir `/ferdalagid`:

- Nei, ekki enn.

Sem hliðarleið á user-level feature flaggi:

- Já, það er réttur farvegur áfram.

## Hvað þarf Stebbi að passa í prófun?

Ekki horfa bara á hvort kortið “virkar”.

Horfa sérstaklega á:

- Er leiðin sjálf trúverðug?
- Sjást mikilvægustu vindtölurnar án þess að kortið verði draslað?
- Er augljóst hvaða brottfarartíma ég er að skoða?
- Þegar ég smelli í scrubber, finnst mér kortið breytast með tímanum?
- Ef ég set vindmörk í 10 og 15, passa litir og pillur við væntingar?
- Er þetta skiljanlegt fyrir venjulegan notanda, ekki bara gagnagrúskara?

## Route intelligence check

Þessi vinna snertir alla route-intelligence stefnu TODO 086:

- route view á nýju MapLibre korti
- provider-station labels
- selected departure slot
- Veðurstofan/Vegagerðin fyrst, MET/Yr aðeins fallback
- user-defined wind thresholds

Engin ný route-þekking var vistuð í `IcelandRoadmap.md` í þessari lotu, því breytingin var UI/presentation og refactor, ekki ný canonical route regla.

## Localhost checks for Stebbi

Slóð:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Prófa:

1. Reikna `Reykjavík` -> `Akureyri`.
2. Skoða hvort vindtölur á leið birtast án smells.
3. Velja annan tíma í scrubber.
4. Skoða hvort litla merkið á kortinu breytist úr `Skoðar: Núna` í `Skoðar brottför: ...`.
5. Skoða hvort summary og kort eru sammála.
6. Prófa `Einfalt` og `Nánar`.
7. Prófa að fela/sýna status-pillu.
8. Prófa langa leið og meta hvort labels séu of mörg.
9. Prófa stutta leið og meta hvort allar mikilvægar tölur sjáist.

Ekki prófa kæruleysislega:

- production deploy
- Supabase migration
- cron
- feature access breytingar
- env/secrets

Þetta var ekki snert í þessari lotu.

## Einföld niðurstaða

Við erum komin úr “getum við birt eigið kort?” yfir í “getum við gert eigið ferðakort sem skilur tíma og vind á leið?”.

Svarið er núna: já, fyrstu partarnir eru komnir.

Næsta stóra spurningin er ekki lengur hvort MapLibre virki. Hún virkar.

Næsta stóra spurningin er hvort leiðin og stöðvamatchingin séu nógu traust til að notandi treysti ráðleggingunni.
