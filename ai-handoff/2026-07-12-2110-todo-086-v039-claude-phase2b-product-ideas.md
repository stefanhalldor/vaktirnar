# TODO 086 - v039 Phase 2B pælingar frá Stebba

Created: 2026-07-12 21:10
Timezone: Atlantic/Reykjavik
Author: Claude Code (frá samtali við Stebba)
Type: Product ideas / plan input fyrir Codex
Scope: Engar kóðabreytingar. Engin framkvæmd. Til rýni hjá Codex.

---

## Bakgrunnur

Phase 2A er tilbúin (v037, samþykkt af Codex v038). Veðurstofugögn birtast nú í point detail card við hliðina á MET/Yr gögnum. Stebbi prófaði á localhost og staðfesti að það virkar.

Stebbi spurði: "Á ég ekki að sjá þetta á neinum öðrum stað?" og "Ég hefði viljað t.d. geta filterað mig á 'Veðurstofan eingöngu' eða 'Yr eingöngu'".

Þetta skjal setur þær pælingar fram sem Phase 2B input fyrir Codex til að para saman við núverandi áætlun.

---

## Núverandi staða eftir Phase 2A

Veðurstofugögn birtast **eingöngu** í point detail card:
- Kortapanelinn (TravelAuditMap, þegar notandi smellir á punkt)
- Route point listinn í `/vedrid` (FerdalagidClient)

Allt annað - map-markerarnir, heatmap-litirnir, heildarniðurstaðan, verdict-logic - er MET/Yr eingöngu. Veðurstofan er samanburðar-lag, ekki ákvörðunartökulag.

---

## Pælingar Stebba um Phase 2B

### 1. Veðurstofan á fleiri stöðum í UI

**Spurning:** Á Veðurstofan að birtast annars staðar en í detail card?

Mögulegar staðsetningar:
- **Heatmap / departure candidates**: Sýna Veðurstofan-gögn við hlið MET/Yr í heatmap-reitunum (t.d. vindur frá báðum)
- **Route summary / verdict**: Nota Veðurstofan sem staðfestingarmerkingu á MET/Yr niðurstöðu ("Veðurstofan staðfestir: 7 m/s S")
- **Map-markerarnir**: Lita eða merkja punkt öðruvísi ef Veðurstofan og MET/Yr eru í ósamræmi

### 2. Provider filter

**Hugmynd Stebba:** Geta filterað á "Veðurstofan eingöngu" eða "Yr eingöngu".

Opnar spurningar sem þarf að leysa:
- **Hvernig birtast heatmap og markers þegar Veðurstofan er eina heimildin?** Veðurstofan mælir ekki gust (aðeins meðalvindur) og enginn sérstakur úrkomuþröskuldur er skilgreindur. Verdict-logic (rautt/gult/grænt) byggir á MET/Yr. Þarf að endurskilgreina þröskuldana ef Veðurstofan er notað eitt sér.
- **Eru gögnin nógu sambærileg?** Veðurstofan gefur 3h skref, MET/Yr gefur 1h. Veðurstofan stöðvar eru fast 29 talsins og covering bara hluta leiðar. Göll í Veðurstofan-þekju þurfa fallback.
- **Hvað þýðir "Veðurstofan verdict"?** Ef Veðurstofan sýnir 12 m/s en MET/Yr sýnir 8 m/s - hvaða gildir? Hvort er notandi að fara eftir?

### 3. Samanburðarútsýni (diff view)

**Hugmynd:** Sýna báðar spár hlið við hlið í detail panel eða sérstakri drawer:
- "MET/Yr: 9,2 m/s · Veðurstofan: 7 m/s" - eru í samræmi
- "MET/Yr: 14 m/s · Veðurstofan: 8 m/s" - ósamræmi - hvorum á að treysta?

Þetta gæti verið nytsamlegt fyrir notendur sem þekkja hvoru heimildinni þeir treysta meira á tilteknum svæðum.

### 4. Confidence indicator

**Hugmynd:** Sýna hversu vel Veðurstofan-stöðin passar við route-punktinn (distanceM, confidence band: good/ok/weak).

Þetta er þegar til staðar í gögnum (confidence field), en birtist ekki í UI.

---

## Spurningar til Codex

1. **Passar þetta við núverandi áætlun?** Phase 2B var nefnd í v033 handoff sem "samanburðarútsýni" og "confidence indicator" - er það sama og Stebbi er að lýsa?

2. **Hvað á Phase 2B að fela í sér?** Codex á að para þessar pælingar saman við það sem þegar er til og leggja til hvað á að vera í Phase 2B vs seinni fösum.

3. **Provider filter - er það raunhæft?** Codex á að meta hvort provider filter sé einfalt eða flókið miðað við verdict-logic sem er MET/Yr-bundið.

4. **Röðun**: Á samanburðarútsýni að koma á undan provider filter? Er eitthvað hér sem á að koma á undan commit/push á Phase 2A?

---

## Hvað þarf EKKI að svara hér

- Phase 2A commit/push - sér spurning, sér leyfi
- met.no timeout - sér framtíðarfasi
- Supabase canonical store - sér plan þegar við komum þangað

---

## Supabase / RLS / Production

Ekkert snert. Þetta er product planning eingöngu.
