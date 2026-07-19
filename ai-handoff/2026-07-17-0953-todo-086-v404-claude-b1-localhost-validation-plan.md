# 2026-07-17 11:15 — TODO-086 v404 — B1 localhost validation plan

Created: 2026-07-17 11:15
Timezone: Atlantic/Reykjavik

Source: `2026-07-17-0951-todo-086-v403-codex-v402-b05-type-fix-review`

## Markmið B1

Staðfesta að núverandi fixed-provider matching hegðar sér rétt með 1 km þröskuldi
á fulltrúar leiðum — án þess að snerta Vík `verified:true` eða framleiðslubreytingar.

Þetta er eingöngu localhost staðfesting. Engin kóðabreyting nema skýr villa finnist
og Stebbi samþykki framkvæmd sérstaklega.

---

## Auth / aðgangsstaða

Tvær prófunarstöður:

| Staða | Hegðun |
|---|---|
| Innskráður með Veðurstofan aðgang | Lag toggle sýnilegt, stöðvar sýndar |
| Innskráður án Veðurstofan aðgangs | Lag toggle **ekki** sýnilegt (403 → `routeStationLayerAllowed = false`) |
| Útskráður | Lag toggle ekki sýnilegt |

Athugaðu sérstaklega að útskráður notandi sem fer á `/vedrid` URL beint fær ekki
villuskilaboð frá provider-stations endapunkti — lag er einfaldlega falið.

---

## Leiðir til að prófa

### 1. Reykjavík → Akureyri (norðurleið)
Þjóðvegur 1 í gegnum miðland — margir Veðurstofan stöðvar á leiðinni.
- Búist við: nokkrar stöðvar á route-selection stigi
- Búist við: sömu stöðvar á lokastigi (final result Veðurstofan card)
- Athugaðu: stöðvar raðaðar eftir `distanceFromOriginM` (norðurátt)

### 2. Akureyri → Reykjavík (öfug stefna)
- Búist við: sömu stöðvaröð en í öfugri röð
- Staðfestir að `matchProviderPointsToRoute` skilar sömu stöðvum óháð stefnu

### 3. Egilsstaðir → Höfn (austurland)
Leiðin yfir Breiðdalsheiði / Djúpivog.
- Búist við: stöðvar á leiðinni (Egilsstaðir, Breiðdalsvík o.fl.)
- **Nota ekki Reykjavík → Egilsstaðir eða Höfn → Þorlákshöfn** sem aðalprófunarleið — þær fara í gegnum Vík/Mýrdalur svæðið sem er enn í `verified:false` stöðu

### 4. Reykjavík → Ísafjörður (Vestfjörður)
Prófar vestfjarðaleiðina og Öxufjörð/Dynjandisvegur svæðið.
- Búist við: stöðvar á leiðinni þar sem Route 1 liggur nálægt þeim

### 5. Þykkvibær → Hvolsvöllur (stutt suðurleið, líklega engar stöðvar)
Stutt leið sem fer ekki nálægt þekktum stöðvum.
- Búist við: **engar** stöðvar — staðfestir false-positive vörn
- Ef stöðvar birtast þar sem þær ættu ekki → skráðu þær og láttu vita

---

## Route-selection lag hegðun

Á route step (áður en leið er staðfest):

1. **Lag toggle:** toggle takki ætti að birtast þegar server leyfir aðgang
2. **Sýna / fela:** kveikja og slökkva á laginu - stöðvamerki á kortinu birtast/hverfa
3. **Stöðvamerki smella:** preview card opnast með
   - stöðvanafni
   - "Veðurstofan" provider label
   - fjarlægð frá leið (t.d. "0.4 km frá leið")
   - forecast rows (næstu 3 tímasetningar)
   - Veðurpúls link
4. **Loka card:** smella X - card hverfur, hægt að smella á aðra stöð
5. **Skipta um leið:** þegar önnur leið er valin → stöðvamerki uppfærast (eða hverfa ef ný leið hefur engar)

---

## Final result stigi

Þegar leið er staðfest og veðurútkoman er sýnd:

1. Veðurstofan kort/section sýnir sömu stöðvar og route-selection lagið sýndi
   - Sömu stöðva-IDs, sömu fjarlægð frá leið
   - Sama röðun eftir `distanceFromOriginM`
2. Stöðvar eru sýndar á réttum stað í ferðaröðinni (ekki öfugum eða handahófskenndum)
3. met.no spákortin eru **óbreytt** — provider stöðvar hafa enga áhrif á met.no sampling

---

## Regression watch

| Þáttur | Búist við |
|---|---|
| met.no spákort | Óbreytt — engin breyting á `sampleRouteWeatherPoints` |
| Púls tenglar | Virkir, fara til rétts Púls threads með return-to hegðun |
| Innskráning/return | `/vedrid` login flow óbreytt |
| Veðurstofan kort á final step | Eins og áður — engar viðbótarfields |
| `ProviderStationPreviewCard` UI | Eins og áður — einungis innra skipulagsbreyting (B0.5) |

---

## Ef villa finnst

Ef eitthvað lítur rangt út á localhost:

1. Skráðu leið, stöð, og væntaða vs. raunverulega hegðun
2. Sendu handoff eða lýsingu — **framkvæmd einungis með skýrt leyfi**
3. Við ákveðum hvort við leiðréttum strax eða geymum í backlog

---

## Þetta er ekki B1 (ekki prófa hér)

- Vík/Mýrdalur `verified:true` staðfesting (deferred, sjá v398)
- Route cache eða áhugahitakort (H0/H1/H2)
- Vegagerðin provider (phase V)
- Iceland overview map (B3)
- Hvers kyns SQL, Supabase, deploy, eða framleiðslubreytingar

---

## Eftir B1 staðfestingu

Þegar Stebbi hefur staðfest B1 á localhost, er næsta skref B2:
Route-selection provider layer UX (show/hide Veðurstofan, station click → shared shell,
preview sýnir nýjustu provider gildi og Púls preview).
