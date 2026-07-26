# TODO 091 v070 — Public vistunarstate og veðurtákn

Created: 2026-07-25 22:20  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti staðbundið að:

1. `Vista mína staði` haldist sýnilegt þegar public notandi fer úr Spágögnum
   yfir á kort og aftur;
2. lítið veðurtákn birtist við hlið hitastigs í samanburðartöflunni;
3. núverandi veðurtákn á kortinu verði 50% stærra.

Stebbi bað sérstaklega um engar prófanir í þessu skrefi.

## Framkvæmt

### `components/weather/RoadMapPrototypeMap.tsx`

- `weatherChasePlacesChanged` state er nú í parent-componentinum sem lifir
  áfram þegar `WeatherChasePanel` er afmountað við flipaskipti.
- State og setter eru send sem controlled props í panelinn.
- Kortatákn voru stækkuð nákvæmlega um 50%:
  - compact: 12 px → 18 px;
  - venjulegt: 14 px → 21 px;
  - samsvarandi height uppfært.

### `components/weather/WeatherChasePanel.tsx`

- Bætt við optional controlled `placesChanged` og
  `onPlacesChangedChange` contracti með innra fallbacki fyrir tests/aðra
  consumers.
- Add/remove staðabreytingar uppfæra nú parent dirty-state þegar parent sendir
  contractið.
- `row.weatherEmoji` birtist lítið, við hlið `{hiti}°C`, án nýrra API-kalla.

## Prófanir

Engar prófanir, type-check eða build voru keyrð samkvæmt skýrri beiðni
Stebba. Aðeins diff var lesinn eftir breytingu.

## Localhost checks for Stebbi

1. Public: opna `/vedrid` og fara í Spágögn.
2. Bæta við eða fjarlægja stað.
3. Vænt: `Vista mína staði` birtist.
4. Fara yfir á kort og aftur í Spágögn.
5. Vænt: takkinn er enn sýnilegur og staðavalið óbreytt.
6. Skoða hitastig í báðum töflu-layoutum, með ≤3 og >3 stöðum.
7. Vænt: lítið veðurtákn birtist strax hægra megin við °C þegar row hefur
   `weatherEmoji`; engin auka eyða þegar tákn vantar.
8. Skoða forecast marker á kortinu í compact og venjulegri stærð.
9. Vænt: emoji er 50% stærra en áður án overlap við spjald, línu eða heiti.
10. Prófa mobile og desktop og passa horizontal overflow og sticky röð.

## Framkvæmdarstaða

Ekkert commit, push, deploy, migration, Supabase-, env- eða production-
inngrip var gert. Dev server var ekki ræstur eða endurræstur.

