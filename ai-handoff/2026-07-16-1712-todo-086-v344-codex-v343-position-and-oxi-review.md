# 2026-07-16 17:12 — TODO-086 v344 — Codex review of v343 position + Öxi analysis

## Findings

### Medium: Öxi er nú virk með óstaðfestri geometry og þarf localhost verification fyrir release

[lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:140>) virkjar nú `oxi-axarvegur-939` með einum approximate corridor point: `{ lat: 64.860, lon: -14.365, radiusM: 6_000 }` á [lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:166>), en `source.verified` er áfram `false` á [lib/weather/routeCautions.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:178>).

Þetta er gott sem localhost-prófanleg útgáfa, en ég myndi ekki gefa þetta út fyrr en Stebbi eða Claude Code hefur visual-staðfest:

- Höfn/Egilsstaðir route sem fer um Öxi fær warning.
- Coastal/fjarðaleiðin fær ekki warning.
- Hnitapunkturinn lendir á fjallvegskaflanum, ekki of nálægt öðrum route variants.

Ef þetta fer út óstaðfest getur notandi fengið falska varúð eða misst mikilvæga varúð. Það er ekki öryggisleki, en þetta er traust/product-risk.

### Medium: Vestfjarðatextinn fullyrðir meira en proxy-reglan veit

Claude hefur nú skýrt í kóðacommentum að Vestfjarðareglan sé `TRANSITIONAL PROXY`, ekki raunverulegt segment-match. Það er heiðarlegt og gott. En UI textinn segir enn:

> “Leiðin fer um erfiðari vegarkafla á sunnanverðum Vestfjörðum...”

Sjá [messages/is.json](</c/Users/Lenovo/Documents/vaktirnar/messages/is.json:849>).

Þar sem reglan er “route fer ekki nálægt Hólmavík og annar endi er í norður/westfjords bounds”, ekki verified Route 60 geometry, ætti textinn að vera aðeins mýkri þar til alvöru corridor er komið inn.

Tillaga:

```txt
Google Maps virðist velja leið sem fer ekki um Hólmavík. Sú leið getur farið um erfiðari vegarkafla á sunnanverðum Vestfjörðum. Leiðin um Hólmavík er oft einfaldari kostur. Athugaðu aðstæður hjá Vegagerðinni.
```

Þetta passar betur við proxy-statusinn og minnkar product liability.

### Medium: `present-near-corridor` notar bara punkt-nálægð, ekki point-to-segment distance

[routePassesNear](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/routeCautions.ts:94>) skoðar aðeins hvort einhver route vertex sé innan radius frá corridor point. Það er einfalt og líklega fínt ef Google polyline er þétt, en getur missa leið sem fer í gegnum bufferinn milli tveggja route punkta.

Fyrir Öxi er radius 6 km, sem mildar þetta. En þegar við förum að bæta fleiri styttri/þrengri kaflum inn verður betra að reikna fjarlægð frá corridor point að route segmenti, ekki bara route vertex.

Ekki blocker fyrir localhost-prófun núna, en þetta þarf inn áður en við köllum segment matcherinn traustan grunn fyrir fleiri vegkafla.

### Low: “coexist” prófið prófar ekki raunverulega coexist hegðun

Í [lib/__tests__/weather-route-cautions.test.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/__tests__/weather-route-cautions.test.ts:204>) heitir testið “Westfjords and Öxi cautions can coexist independently”, en það staðfestir bara að ID strengirnir séu ekki jafnir.

Ef coexist skiptir máli, testið ætti að kalla `matchRouteCautions` með route points sem triggera bæði og staðfesta að bæði results komi til baka. Annars má einfaldlega fjarlægja eða rename-a testið. Þetta er ekki blocker.

## Staðfestingar sem ég keyrði

- `npm run test:run -- lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts` → pass, 2 files, 117/117 tests.
- `npm run type-check` → pass.

Ég keyrði ekki localhost/browserpróf.

## Mat á v343 afstöðu

Mér finnst v343 betra en v341 vegna þess að það hættir að fela að Vestfjarða-reglan sé proxy. Það er mikilvægt.

Ég er sammála þessari afstöðu ef Stebbi samþykkir hana sem tímabundið skref:

- **Westfjords:** transitional proxy, ekki endanlegt segment layer.
- **Öxi:** active segment, en bara eftir visual localhost verification.
- **Bidirectional Hólmavík alternate:** known limitation, ekki lagað núna.

Ég myndi samt ekki setja þetta út sem “v340 fully implemented”. Réttara release language:

> Fyrsta útgáfa af sérmerktum varasömum leiðum: Öxi segment detection + tímabundin Hólmavík proxy-regla fyrir Vestfirði.

## Localhost checks for Stebbi

Prófa á `http://localhost:3004/vedrid`.

### Öxi

1. Velja `Höfn → Egilsstaðir`.
2. Staðfesta hvort Google route fer um Öxi / Axarveg 939.
3. Route option á að sýna `Varasamt með eftirvagna`.
4. Texti á að útskýra Öxi compact og ekki ýta duration/route card í rugl á 360/390/460 px.

Svo prófa:

1. `Egilsstaðir → Höfn`.
2. Sama warning ætti að birtast ef route fer um Öxi.

Ef Google býður coastal/fjarðaleið sem route option:

- Hún á ekki að fá Öxi warning.
- Ef hún fær warning þarf að þrengja radius eða færa corridor point.

### Vestfirðir

1. `Höfn → Ísafjörður`.
2. Base routes sem fara ekki um Hólmavík fá líklega `Varasamt með eftirvagna`.
3. `Gegnum Hólmavík` ætti að birtast ef Google skilar ekki sjálfur slíku route.
4. Textinn ætti helst að vera mýktur áður en release fer út, því þetta er proxy.

### Regression

1. `Reykjavík → Akureyri` á ekki að fá Vestfjarða eða Öxi warning.
2. Route selection á mobile má ekki fá lárétt overflow.
3. Confirm button og route-card click state eiga að virka eins og áður.

Ekki keyra SQL, Vercel, deploy eða Supabase breytingar út frá þessari rýni.

## Tillaga að næsta skrefi

Áður en release:

1. Mýkja Vestfjarða summary textann til að endurspegla proxy-reglu.
2. Láta Stebba visual-prófa Öxi route á localhost.
3. Ef Öxi detection er rétt, annaðhvort:
   - setja `source.verified: true`, eða
   - halda `false` en skrifa í handoff að þetta sé knowingly approximate og eingöngu prófunarflaggað.
4. Bæta eða rename-a coexist testið.

## Óvissa / þarf að staðfesta

- Ég hef ekki visual-staðfest Öxi hnitin.
- Ég las ekki alla unrelated diffið í þessari lotu, aðeins route caution og message/test snertifleti.
