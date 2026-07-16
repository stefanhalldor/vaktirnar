# Codex review: TODO #75 v014 — Sticky dagur í scrubber og skýrara summary box

Created: 2026-07-08 22:20
Timezone: Atlantic/Reykjavik
Agent: Codex
Review target: `2026-07-08-2214-todo-075-v013-claude-screenshot-proof-polish.md`
Related TODO: #75

---

## Stebbi correction

Stebbi átti ekki við að setja dagsetningu sem `Valið:` línu undir scrubbernum.

Rétta UX-óskin:

- Dagamerkið inni í horizontal scrubbernum á að vera sticky/floating.
- Þegar notandi scrollar slot-röðina á dagurinn að “fljóta” með vinstra megin.
- Þegar næsti dagur kemur á hann að ýta fyrri deginum út og verða sticky sjálfur.
- Þetta á að virka eins og sticky section header í horizontal timeline.

Skjámyndin sýnir líka að íslenskt UI er að birta `Thu. 9. Jul`, sem er rangt. Þetta á að vera íslenskt, t.d. `Fim. 9. júl`.

---

## Findings fyrst

1. **Major — v013 útfærði fallback sem Stebbi vildi ekki sem aðal UX.**
   `Valið: Thu. 9. Jul kl. 04:28` undir scrubber leysir screenshot-samhengi, en ekki óskina um sticky dagamerki inni í scrubber. Það má halda `Valið:` ef það hjálpar, en það má ekki koma í stað sticky day marker.

2. **Major — íslenskt UI má ekki sýna enska daga/mánuði.**
   Skjámyndin sýnir `Thu. 9. Jul` í íslenskum skjá. Allir dagsetningarstrengir í íslensku UI eiga að nota `is-IS` eða handstillt íslenskt format: `Fim. 9. júl kl. 04:28`.

3. **Medium — combined box er orðið gagnlegt en scatterað.**
   Nú blandast brottför, leiðarstaða, mest krefjandi punktur, status setning og áfangastaðaspá saman. Það er rétt efni, en þarf betri upplýsingarkitektúr.

4. **Medium — veðurmörk-línan er góð en má vera meira intentional.**
   `Veðurmörk: vindur 10/15 m/s · hviður 18 m/s · úrkoma 5 mm/klst` er rétt stefna, en hún þarf að vera sjónrænt tengd pillunum og ekki keppa við aðalniðurstöðu.

---

## Sticky day marker: mælt útfærsla

### UX

Inni í horizontal scrubber:

```text
[sticky Fim. 9. júl]  00:28 01:28 02:28 03:28 04:28 ...
```

Þegar næsti dagur nálgast:

```text
[sticky Fös. 10. júl]  00:28 01:28 ...
```

Dagamerkið á að vera hluti af scroll-röðinni, ekki lína fyrir utan hana.

### Tæknileg leið

Mælt:

1. Groupa `filteredWithIdx` eftir date key.
2. Rendera hverja dagahóp sem horizontal flex group.
3. Setja dagamerki inni í hverjum group sem:

```tsx
<div className="sticky left-1 z-10 ...">
  {formatDayLabel(...)}
</div>
```

4. Sticky element þarf bakgrunn, t.d. `bg-card`, svo slotar renni ekki undir textann.
5. Sticky day marker þarf fast/min width svo hann hoppi ekki milli daga.
6. Sticky marker má vera aðeins lægra/sett við baseline slotanna, en á ekki að taka of mikla hæð.

Athugið: Til að næsti dagur “ýti” fyrri degi út er oft betra að sticky markerinn sé inni í per-day group sem hefur breidd allra slotanna fyrir þann dag. Þá er sticky behavior constrained við hópinn.

### Ekki treysta á browser default locale

`formatDayLabel` á alltaf að fá normalized locale og skila íslensku þegar UI er íslenskt.

Próf/acceptance:

- `formatDayLabel('2026-07-09T04:28:00Z', 'is')` -> `Fim. 9. júl`
- `formatCompactDateTime('2026-07-09T04:28:00Z', 'is')` -> `Fim. 9. júl kl. 04:28`
- Sama með `is-IS`
- Ekki `Thu. 9. Jul` í íslensku UI.

---

## Summary box: mælt upplýsingaskipan

Codex mælir með að skipta rauða kassanum í þrjár skannanlegar einingar, helst lightweight rows/bands frekar en þung nested cards.

### 1. Brottför

Stutt og screenshot-proof:

```text
Brottför
Fim. 9. júl kl. 04:28
Gott ferðaveður m.v. valin veðurmörk.
```

Eða fyrir gult:

```text
Brottför
Fim. 9. júl kl. 04:28
Gæti orðið óþægilegt m.v. valin veðurmörk.
```

### 2. Á leiðinni

Þetta er aðal deterministic niðurstaðan:

```text
Á leiðinni
Mest krefjandi er 136 km frá Akureyri, kl. 06:05.
Vindur: 7,6 m/s · Úrkoma: 0 mm/klst · Hiti: 9,3°C
```

Ef allt er grænt má samt sýna:

```text
Á leiðinni
Gott ferðaveður m.v. valin veðurmörk.
Mest krefjandi er ...
```

Ef `mest krefjandi` er upphaf ferðar, nota fyrri #72 orðalag:

`Mest krefjandi er við upphaf ferðarinnar, kl. HH:MM.`

### 3. Áfangastaður

Núverandi arrival block, en með íslensku locale:

```text
Áfangastaður
Komutími fim. 9. júl kl. 09:08, spáin þar kl. 09:00:
Vindur: 5,8 m/s · Úrkoma: 0,1 mm/klst · Hiti: 10,4°C
Skoða spána á áfangastað betur
```

### Af hverju þetta er betra

- Brottför segir “hvenær fer ég og er það gott/óþægilegt?”
- Á leiðinni segir “hvað gerist á ferðinni?”
- Áfangastaður segir “hvað tekur á móti mér?”
- Screenshot af boxinu stendur sjálfstætt án þess að þurfa route header eða scrubber.

---

## Texta- og locale-athugasemdir

### Íslensk dagsetning

Nota alltaf:

```text
Fim. 9. júl kl. 04:28
```

Ekki:

```text
Thu. 9. Jul kl. 04:28
```

Ef `useLocale()` skilar óvæntu gildi þrátt fyrir íslenska messages, þarf að finna rótina. Ekki patcha með browser default.

### Status texti

Mælt:

- `Gott ferðaveður m.v. valin veðurmörk.`
- `Gæti orðið óþægilegt m.v. valin veðurmörk.`
- `Ekki mælt með ferð m.v. valin veðurmörk.`

Þetta er mildara og nákvæmara en að segja bara “Brottför ... lítur vel út” í stóra status-línu.

---

## Veðurmörk nálægt pillum

Halda línunni, en gera hana rólega:

```text
Veðurmörk: vindur 10/15 m/s · hviður 18 m/s · úrkoma 5 mm/klst
```

Mælt staðsetning:

- undir coverage texta
- fyrir ofan eða rétt undir filter pillunum
- texti `text-[10px] text-muted-foreground`

Ekki setja emoji/mörk inn í pillurnar í þessari útgáfu. Það má skoða síðar ef við viljum gera “legend” ríkari.

---

## Scope recommendation

Þetta er ekki Phase 2 nætursía. Þetta er Phase 1.1 polish.

Mælt að Claude geri:

1. Sticky day marker inni í scrubber.
2. Laga íslenskt locale í öllum nýjum date labels.
3. Endurskipuleggja summary box í `Brottför`, `Á leiðinni`, `Áfangastaður`.

Ekki bæta við:

- night filter
- gust trend arrows
- Mapbox/provider vinnu
- raw met.no cleanup nema Stebbi biðji um það sérstaklega

---

## Localhost checks for Stebbi

Opna `/auth-mvp/vedrid` á localhost.

Prófa:

1. Reikna Akureyri -> Garðabær eða aðra leið sem sýnir slot yfir miðnætti.
2. Skrolla horizontal scrubber yfir dagamót.
3. Vænt: dagamerki inni í scrubber helst sticky vinstra megin.
4. Vænt: þegar næsti dagur kemur, ýtir hann fyrri degi út og verður sticky.
5. Vænt: íslenskt UI sýnir `Fim. 9. júl`, ekki `Thu. 9. Jul`.
6. Velja slot.
7. Vænt: summary boxið er skipt í `Brottför`, `Á leiðinni`, `Áfangastaður`.
8. Vænt: `Brottför` sýnir bara brottfarardag/tíma og stöðu m.v. valin veðurmörk.
9. Vænt: `Á leiðinni` sýnir mest krefjandi punkt, tíma og vind/úrkomu/hita.
10. Vænt: `Áfangastaður` sýnir komutíma og spá á áfangastað með íslenskri dagsetningu.
11. Prófa 360, 390 og 460 px.
12. Vænt: sticky day marker og summary box valda ekki horizontal overflowi eða layout hoppi.

Engar SQL/RLS/auth/Supabase breytingar. Engar nýjar met.no eða Google API beiðnir.

---

## Codex conclusion

Já, ég skil sticky-day óskina: dagurinn á að vera hluti af scrubbernum og fljóta með honum, ekki vera `Valið:` lína fyrir neðan.

Ég myndi líka nota þetta tækifæri til að einfalda rauða summary-svæðið í þrjár einingar:

`Brottför` -> `Á leiðinni` -> `Áfangastaður`

Það gerir niðurstöðuna miklu rólegri, skannanlegri og betri fyrir screenshot.
