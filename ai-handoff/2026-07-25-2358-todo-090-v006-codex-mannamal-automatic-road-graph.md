# Teskeiðarleiðir — staðan á mannamáli

**Dagsetning:** 25. júlí 2026 kl. 23:58

## Stóra niðurstaðan

Við erum ekki lengur bundin við að handskrifa eina leið í einu.

Teskeið getur nú lesið allt opinbera vegakerfið inn sem tengt vegagraf og reiknað sjálft leið milli staða. Kerfið veit hvaða vegkaflar tengjast, í hvaða átt má aka, hvaða yfirborð er skráð og getur valið eftir vegalengd, áætluðum tíma eða kröfu um bundið slitlag.

Sem raunpróf fann kerfið sjálft malbikaða leið frá Reykjavík til Akureyrar:

- um 390 km
- um 4 klst. og 35 mín. samkvæmt varfærnum, útreiknuðum hraða
- 57 vegkaflar
- ekkert malar-, blandað eða óþekkt yfirborð á valinni leið

Þetta var reiknað úr opinberu vegagögnunum. Enginn skrifaði Reykjavík–Akureyri leiðina handvirkt inn.

## Af hverju þetta skiptir máli

Þetta er grunnurinn að þeirri framtíðarsýn að Teskeið geti:

- boðið eigin leiðir samhliða Google Maps;
- forðast ómalbikaða vegi, fjallvegi eða óvissa kafla eftir þörfum;
- reiknað hvar bíllinn verður á hverjum tíma;
- raðað veður-, vindhviðu- og færðargögnum framundan á rétta staði og tíma;
- útskýrt af hverju leið var valin eða hafnað;
- orðið smám saman óháð Google Maps.

## Hvað er ekki tilbúið enn

Þetta er sterkur reiknikjarni en ekki tilbúin leiðsögn fyrir almenning:

- Vegagerðin gefur ekki hámarkshraða í þessum tveimur gagnalögum. Tíminn notar því varfærna reiknireglu og er merktur sem útreiknaður, ekki opinber.
- Byrjunar- og endastöðum er enn smellt á næsta tengjanlega vegpunkt. Í prufunni munaði um 0,8–1,1 km; næsta skref er að smella nákvæmlega á veglínuna.
- Nokkrir vegakaflar hafa blandað slitlag. Kerfið giskar ekki og útilokar þá úr strangri malbikaðri leið þar til hægt er að skipta þeim nákvæmlega.
- Lokanir, vetrarástand, beygjubönn, ferjur og stærðar-/þyngdartakmarkanir ökutækja þurfa meiri vinnu.
- Kerfið er ekki tengt við viðmótið og hefur ekki verið virkjað fyrir notendur.

## Næsta stóra skref

Næst ætti Claude Code að rýna tæknilega handoffið og síðan byggja breiða sjálfvirka samanburðarprófun fyrir tugi leiða um landið. Samhliða þarf nákvæmari staðsetningu á veglínum og útgáfustýrt, staðfest afrit af vegagrafinu sem Teskeið getur lesið hratt án þess að sækja allt vegakerfið í hverri beiðni.

Þegar það er grænt má tengja reiknivélina inn í núverandi shadow-mode, enn ósýnilega notendum, og bera niðurstöðurnar kerfisbundið saman við Google og raunverulegan akstur. Aðeins eftir þau öryggisgátt ættum við að bjóða Teskeiðarleið sem aukaleið.

## Prófunarstaða

- Öll 3.663 virk sjálfvirk próf verkefnisins standast.
- Production build klárast.
- Beina, lesvæna prófið á opinberu vegagögnunum fann Reykjavík–Akureyri leiðina.
- Engin UI-, gagnagrunns-, production-, commit-, push- eða deployment-breyting var gerð.

## Localhost checks for Stebbi

Það er ekkert nýtt sýnilegt að prófa enn. Núverandi `/vedrid` á að líta út og virka alveg eins og áður. Teskeiðarleiðir eiga ekki að birtast sem valmöguleiki fyrr en öryggisprófun og shadow-samanburður hafa staðist.
