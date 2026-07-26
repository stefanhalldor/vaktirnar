# TODO #90 — Mannamál: hvar eigið leiðakerfi stendur

Created: 2026-07-25 23:23  
Timezone: Atlantic/Reykjavik

## Staðan í einni málsgrein

Við erum komin með fyrsta falda grunninn að eigin leiðakerfi Teskeiðar. Kerfið
getur nú tekið við upphafs- og áfangastað í sameiginlegu formi og keyrt mjög
einfalda Teskeiðar-tilraun samhliða Google án þess að sýna hana notandanum.
Google er enn 100% það sem notandinn fær. Teskeiðar-tilraunin er aðeins
bráðabirgðapróf sem þekkir fjórar grófar leiðir frá höfuðborgarsvæðinu.

## Hvað er raunverulega komið

- Sameiginlegt tungumál fyrir Google-leiðir og framtíðar Teskeiðarleiðir.
- Sér rofi sem getur kveikt og slökkt á falinni Teskeiðar-tilraun.
- Einfaldur provider sem þekkir fjórar grófar landsleiðir.
- Prófanir sem staðfesta að providerinn og rofinn virki eins og kóðinn segir.
- Engin breyting á því sem public eða innskráður notandi sér.
- Engin ný gagnavistun, migration eða production-breyting.

## Af hverju við kveikjum ekki strax

Þrjú atriði þarf að laga fyrst:

1. Falda vinnan er ræst með venjulegu „fire-and-forget“. Í serverless umhverfi
   er ekki tryggt að hún fái að klárast eftir að svarið hefur verið sent.
2. Tilraunaleiðirnar eru enn aðeins grófir punktar. Til dæmis getur leið sem
   endar á Húsavík verið valin fyrir Akureyri vegna stórs radíuss. Vegalengd og
   tími eru því ekki hæf til samanburðar við Google.
3. Villutexti getur nú innihaldið nákvæm upphafs- og áfangahnit. Það verður að
   hreinsa áður en við byrjum að skrá niðurstöður í logs.

Þetta eru ekki vandamál sem notandi finnur núna því flaggið er slökkt og ekkert
er sýnt. Þau eru ástæða þess að við herðum grunninn áður en rannsóknin hefst af
alvöru.

## Næsta skref

Næsti áfangi er „örugg shadow keyrsla“:

- tryggja að serverinn leyfi falda útreikningnum að klárast;
- skrá aðeins hvort Teskeið þekkti leiðafjölskylduna, aldrei heimilisföng eða
  hnit;
- koma í veg fyrir að shadow-villa geti haft áhrif á Google-leiðina;
- greina venjulegan bíl frá hjólhýsi í tilrauninni;
- bæta við prófum sem sanna að svar notandans sé alltaf óbreytt.

Eftir það getum við kveikt á shadow mode á localhost og séð, í öruggum logs,
hversu margar ferðir falla í þær leiðafjölskyldur sem Teskeið þekkir.

## Hvað kemur þar á eftir

1. Staðfesta opin vegagögn og leyfi Vegagerðarinnar/OSM.
2. Byggja fyrsta raunverulega road graph fyrir afmarkaðar leiðir.
3. Tengja slitlag, fjallvegi, brýr, lokanir og veður við vegkaflana.
4. Láta eigin leiðarvél reikna eina eða tvær staðfestar leiðir í shadow mode.
5. Bera niðurstöður saman við golden route próf, ekki treysta Google blindandi.
6. Bjóða fyrstu Teskeiðarleiðina sem valfrjálsa aukaleið við hlið Google.
7. Stækka hægt yfir Ísland og halda Google sem fallback þar til eigin grunnur er
   sannreyndur.

## Hvað þetta gerir okkur kleift að gera síðar

- Velja leið með bundnu slitlagi þó hún sé örlítið lengri.
- Forðast F-vegi, fjallvegi eða erfiða kafla eftir ökutæki.
- Segja hvar malarkafli byrjar og hversu langur hann er.
- Reikna hvenær notandi kemur að næsta vegkafla.
- Sýna hvort vindur og hviður verði að aukast eða minnka þar.
- Endurmeta leið og stoppistaði í rauntíma þegar aðstæður breytast.

## Það sem er óbreytt

- Notendur sjá áfram aðeins núverandi Google-backed Akstur.
- Engin sjálfstæð turn-by-turn leiðsögn er komin.
- Engar Teskeiðarleiðir eiga að birtast opinberlega strax.
- Engin production flags eiga að vera virkjuð án sérstakrar ákvörðunar.

## Localhost checks for Stebbi

Það er ekkert nýtt sýnilegt að prófa í núverandi áfanga. Stebbi getur staðfest að
venjulegur Akstur virki áfram, en á ekki að kveikja á shadow flagginu fyrr en
næsta hardening-skref er tilbúið.

Þegar það skref er lokið verður localhost-prófið einfalt: reikna venjulega leið,
sjá eina nafnlausa og hnitalaust shadow-niðurstöðu í server-loggi og staðfesta að
notandinn fái nákvæmlega sömu Google-leið og áður.

## Öryggi og persónuvernd

Markmiðið er að læra um route families og vegkafla, ekki ferðir einstaklinga.
Við eigum ekki að vista nákvæm heimilisföng, GPS-ferla eða hráar
Google-niðurstöður. Þegar live akstur kemur síðar þarf sérstakt samþykki fyrir
GPS, retention og notendaskýringar.

## Óvissa / þarf að staðfesta

- Routing engine hefur ekki verið valin.
- Formleg open-data leyfisrýni er ekki lokið.
- Fyrsta raunverulega road-graph leiðin hefur ekki verið valin.
- Confidence: hátt um stöðu núverandi tilraunar og næsta hardening-skref; medium
  um tímalínu eigin routing þar til gagnagæði og engine hafa verið prófuð.
