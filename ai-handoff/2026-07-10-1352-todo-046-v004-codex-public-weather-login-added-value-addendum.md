# Codex addendum: TODO #46 v004 - public Veðrið login as added value

Created: 2026-07-10 13:52
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, v003 public Veðrið/Umönnun handoff

## Staða

Stebbi bætti við pælingu eftir v003:

> Bæta við label á fyrsta skrefi veðursins hjá public notendum að notaðir
> staðir vistist á innskráða notendur (setja í added value stíl) og setja
> "Innskrá" takka?

Codex er sammála. Þetta á að vera léttur added-value prompt, ekki login wall.

## Product decision

Í public Veðrið guest mode á fyrsta skrefi skal sýna litla, rólega ábendingu:

- að óinnskráðir geti notað Veðrið strax,
- að innskráðir fái aukaþægindi: nýlegir/notaðir staðir vistast,
- og að hægt sé að skrá sig inn með einum takka.

Meginmarkmið:

- Halda aðalflæðinu óhindraðu.
- Login er aukagildi, ekki krafa.
- Notandi á ekki að upplifa að hann sé að missa virkni nema hann vilji vistun.

## Suggested UI placement

Staðsetning:

- Á fyrsta skrefi Veðursins, áður eða rétt eftir Frá/Til innsláttarsvæði.
- Aðeins fyrir public/guest users.
- Ekki sýna innskráðum notendum.
- Ekki setja þetta sem stórt kort sem ýtir aðalverkefninu langt niður.

Útlit:

- Compact info/benefit strip eða lítil row.
- Hlýr, rólegur Teskeið-stíll.
- Má nota litla icon/merki, t.d. saved/recent/place icon, en ekki gera þetta að viðvörun.
- Takkinn `Innskrá` á að vera secondary eða small primary eftir samhengi.
- Texti og takkinn mega ekki valda horizontal overflow á 360px.

Forðist:

- "Skráðu þig inn til að nota þetta" tón.
- Stóra auth-CTA sem lítur út eins og blocker.
- Að fela route controls eða ýta þeim langt niður.

## Suggested Icelandic copy

Tillaga A:

```text
Þú getur notað Veðrið strax. Skráðu þig inn ef þú vilt að nýlegir staðir vistist.
```

Button:

```text
Innskrá
```

Tillaga B, aðeins hlýrri:

```text
Notaðu Veðrið strax. Með innskráningu vistast nýlegir staðir fyrir næstu ferð.
```

Button:

```text
Innskrá
```

Codex mælir með B ef pláss leyfir.

## Routing

`Innskrá` takkinn:

- fer á `/innskraning`,
- ætti helst að bera `next`/return-to upplýsingar ef núverandi auth-flow styður það,
- annars er nóg í fyrsta fasa að opna `/innskraning`.

Ef return-to er útfært:

- Ekki setja raw route query með viðkvæmum staðaupplýsingum.
- Ekki setja lat/lon, placeId, route polyline eða destination í URL sem login redirect metadata nema það sé sérstaklega hannað.
- Fyrsti fasi má sleppa því að varðveita óinnskráða route state yfir login.

## Implementation notes for Claude Code

Þegar public Veðrið er útfært:

1. Finna fyrsta step componentið í `app/auth-mvp/vedrid/FerdalagidClient.tsx` eða nærliggjandi child component.
2. Bæta við prop eða state sem segir hvort user sé guest/public.
3. Sýna added-value strip aðeins þegar `isGuest === true`.
4. Setja texta í `messages/is.json` og `messages/en.json`.
5. Nota `Link` á `/innskraning` eða núverandi routing helper.
6. Ekki tengja þetta við saved-places API fyrir guest. Þetta er bara CTA/skýring.
7. Passa að saved places haldist disabled/empty fyrir guest.

## Localhost checks for Stebbi

### Guest

1. Opna `/vedrid` í incognito eða óinnskráður.
2. Vænt: fyrsta skref sýnir litla added-value línu um að nýlegir/notaðir staðir
   vistist fyrir innskráða notendur.
3. Vænt: `Innskrá` takki sést, en aðalflæðið er áfram nothæft án þess að smella.
4. Slá inn Frá/Til og halda áfram.
5. Vænt: ekkert save-place error sést.

### Login CTA

1. Smella á `Innskrá`.
2. Vænt: notandi fer á `/innskraning`.
3. Ef return-to er útfært: eftir login fer notandi aftur á Veðrið án þess að raw
   staðsetningargögn hafi verið geymd í URL.

### Authenticated

1. Skrá sig inn og opna Veðrið.
2. Vænt: added-value login strip sést ekki.
3. Vænt: nýlegir/notaðir staðir virka eins og áður.

### Mobile

Prófa við 360px, 390px og 460px:

- strip/takki veldur ekki horizontal overflow,
- Frá/Til input færist ekki óþægilega langt niður,
- `Innskrá` touch target er minnst um 40px á hæð eða sambærilega snertanlegt,
- texti wrappar snyrtilega.

## Óvissa / þarf að staðfesta

- Hvort `FerdalagidClient` hefur nú þegar auth/user context eða hvort public
  route þarf að senda `isGuest` prop niður.
- Hvort login-flow styður öruggt return-to án þess að leka route state.
- Endanlegt orðalag má Stebbi velja eftir að sjá það í UI.
