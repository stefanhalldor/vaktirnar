# #5 v008 - Mobile closeout: Stebbi prófar, Codex lokar

## Fyrir Stebba

Þetta er listi yfir það sem þú þarft að prófa til að geta kvittað út #5.
Allt er á localhost. Þú þarft ekki að breyta neinu, bara prófa.

Opnaðu Chrome DevTools og stilltu responsive mode á 360 px breidd.

---

### Próf 1 — Röðunarval á Lánað og skilað (nýtt fix)

**Hvar:** `/auth-mvp/lanad-og-skilad`

**Hvað var lagað:** Röðunarvalið (Nýjast/Elst) notaði of lítinn leturpunkt
(12 px) sem veldur sjálfvirkum zoom á iOS/Safari þegar select fær focus.
Breytt í 16 px.

**Hvað á að gerast núna:**
1. Opnaðu `/auth-mvp/lanad-og-skilad`.
2. Smelltu á röðunarvalið (Nýjast/Elst).
3. Vænt: síðan þysjar ekki inn, engin óvænt láréttur skrunn.
4. Breyttu milli Nýjast og Elst.
5. Vænt: valið virkar, listinn endurraðast.

**Ef þú ert á raunverulegu iOS tæki:** Prófaðu þar líka. Það er þar sem
zoom-vandinn kemur greinilegt fram.

---

### Próf 2 — Leitarreitur á Lánað og skilað

**Hvar:** `/auth-mvp/lanad-og-skilad`

**Þetta var þegar í lagi en við viljum staðfesta:**
1. Smelltu á leitarsvæðið.
2. Vænt: engin zoom, lyklaborð opnast eðlilega.
3. Sláðu inn hluti.
4. Vænt: listar sig eftir, engin lárétt yfirflæðning.

---

### Próf 3 — Innskráningarform

**Hvar:** `/innskraning`

1. Smelltu á netfangsreit.
2. Vænt: engin zoom.
3. Ef kóðareitur birtist, smelltu þar líka.
4. Vænt: engin zoom, kóðareiturinn (stór tölustafir) er sérstaklega auðlesinn.
5. Lokaðu lyklaborði.
6. Vænt: síðan er í sömu stöðu og áður, ekki þysjaður.

---

### Próf 4 — Lánaskráning

**Hvar:** `/auth-mvp/lanad-og-skilad/ny`

1. Smelltu á `Heiti hlutar`.
2. Vænt: engin zoom.
3. Smelltu á dagsetningarreit (Lánsdagur).
4. Vænt: dagatalið opnast án zoom.
5. Smelltu á athugasemdabox.
6. Vænt: engin zoom, box stækkar ekki óeðlilega.

---

### Próf 5 — Tengsl

**Hvar:** `/stillingar/tengsl` og svo inn í eitt tengsl

1. Opnaðu `/stillingar/tengsl`.
2. Smelltu á eitt tengsl.
3. Smelltu á flokkurval (Vinur/Fjölskylda/osfrv).
4. Vænt: engin zoom.
5. Smelltu á `Mitt heiti á þessum aðila`.
6. Vænt: engin zoom.
7. Smelltu á athugasemdabox.
8. Vænt: engin zoom.
9. Smelltu á til baka.
10. Vænt: kemur til baka án vandræða.

---

### Próf 6 — Þekki málið / Kannast ekki við þetta á lista (#55)

Aðeins ef þú ert með opið pending lánaboð (ekki tengslatest sem er þegar skilað).

**Hvar:** `/auth-mvp/lanad-og-skilad`

1. Athugaðu hvort pending boð sé efst á listanum.
2. Vænt: `Þekki málið` og `Kannast ekki við þetta` sjást beint á listanum.
3. Athugaðu `/auth-mvp/heim`.
4. Vænt: badge sýnir bara pending boð á opnum lánum (ekki skilað tengslatest).

---

### Hvað þarf ekki próf

Þessar hlutir eru samkvæmt kóðarýni þegar í lagi og þurfa ekki sérstakt próf:
- Öll inntakssvæði í LoanForm (item name, email, nota)
- Flokkurval í Tengslum
- Öll form í breyta- og bæta-við-aðila flæðum

---

### Staðfesting til Codex

Þegar þú hefur prófað, svaraðu einhverju á þessa leið:

> Prófaði #5 mobile. [Hvað gekk vel.] [Hvað var vandinn ef eitthvað var.]

Ef allt gekk vel:
> Prófaði #5 mobile. Engin zoom, engin overflow, allt gekk. Má loka.

Ef eitthvað var að:
> Prófaði #5 mobile. Fann [lýsing á vandamáli] á [hvar].

---

## Fyrir Codex (eftir staðfestingu frá Stebba)

### Hvað var gert í þessum áfanga (#5 v007-v008)

**Commit:** `13ab31c` -- `fix: text-base on sort select in LoanList to prevent iOS zoom (#5)`

**Ein breyting:** `components/loans/LoanList.tsx` -- sort `<select>` breytt úr
`text-xs` (12 px) í `text-base` (16 px). Design.md regla: focusable controls
þurfa 16 px á mobile til að koma í veg fyrir iOS auto-zoom.

**Kóðarýni staðfesti að þessir components voru þegar í lagi:**
- `LoanForm.tsx` -- allt `text-base`
- `AddPartyForm.tsx` -- allt `text-base`
- `LoanDateField.tsx` -- hidden date input notar `style={{ fontSize: '16px' }}`
- `TagSelectForm.tsx` -- select `text-base`
- `RelationshipDetailsForm.tsx` -- allt `text-base`
- `TeskeidLoginForm.tsx` -- email `text-base sm:text-sm`, kóðareitur `text-xl`

**Loading routes:** Allar virkar route-segments hafa `loading.tsx`. Ekkert vantar.

### Hvað Codex á að gera eftir staðfestingu

1. **Uppfæra TODO.md:**
   - Finna #5 og minnka scope eða merkja þennan áfanga lokinn.
   - Ef Stebbi staðfestir að allt er í lagi: breyta stöðu í lokinn.
   - Ef Stebbi nefnir eitthvað sem vantar: skrá það sem #5 næsta áfangi.

2. **Uppfæra DONE.md** ef Stebbi leyfir:
   - Bæta við #5 v007-v008 móbilelárpakka með stuttri lýsingu.

3. **Engin kóðabreyting** nema Stebbi nefni raunverulegt vandamál sem þarf að laga.

4. **Ef Stebbi nefnir vandamál:** búa til nýja handoff með nákvæmri lýsingu á
   vandanum, í hvaða browser/tæki hann kom fram, og við hvaða breidd.

### Enn opið í #5 (ef Stebbi staðfestir enga frekari vandamál)

Þessir hlutir eru utan þessa áfanga og bíða næstu umferðar ef þörf krefur:

- **Client navigation pending state:** `router.back()` og `router.push()` í
  LoanForm, AddPartyForm o.fl. sýna ekki pending state á meðan navigation bíður.
  Þarf manual próf til að staðfesta hvort vandinn er sýnilegur í framkvæmd.
- **iOS Safari raunpróf á tæki:** Chrome DevTools responsive mode líkir eftir
  skjástærð en ekki iOS scroll- og zoom-hegðun að fullu. Ef Stebbi hefur aðgang
  að iPhone, prófaðu þar.
- **Safe area insets:** Neðri hluti síðna við notkuná iPhone með home indicator.
  Líklega ekki vandamál með núverandi pb-10 padding en ekki prófað sérstaklega.
- **PNG-icons:** `public/icon-192.png` og `public/icon-512.png` eru gömul og
  samræmast ekki nýja 10-minimal favicon. Þarf handvirka rasterexport.

### Suggested commands eftir Stebba-staðfestingu

```powershell
npm run type-check
```

Engar kóðabreytingar eru væntanlegar ef Stebbi staðfestir að allt er í lagi.
