# TODO #67 Vedrid - Spurningar til Stebba áður en framkvæmd byrjar

Created: 2026-07-03 15:56
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi
Status: Beðið eftir svörum. Engin framkvæmd hefst fyrr en Stebbi svarar og gefur skýrt leyfi.

---

## Samhengi

Allar tæknilegar ákvarðanir eru lokaðar (v019–v038). Þrjár spurningar og framkvæmdarleyfi standa eftir.

---

## Spurning 1 — Golf courses í `places.ts`

Grafarholt golfvöllur er þegar þar. Hvaða golfvellir bætast við?

Til hliðsjónar — þessir eru algengir íslenskir golfvellir:

- [ ] Keilir Golf Club (Hafnarfjörður)
- [ ] Korpa Golf Club (Reykjavík)
- [ ] Golfklúbbur Vesturbæjar (Reykjavík)
- [ ] Leynir Golf Club (Akranes)
- [ ] Ness Golf Club (Akureyri)
- [ ] Garðabær Golf Club
- [ ] Kópavogs Golf Club
- [ ] Borgarnes Golf Club

> **Stebbi svarar:** Haka við þá sem eiga að vera með, eða skrifar þína lista.

---

## Spurning 2 — Ferðamannastaðir og leiðarstaðir í `places.ts`

Apavatn er þegar á listanum. Hvaða staðir bætast við?

Til hliðsjónar — algengir áfangastaðar með hjólhýsi/eftirvagn:

- [ ] Húsavík
- [ ] Mývatn
- [ ] Akureyri (þegar til staðar)
- [ ] Vík í Mýrdal
- [ ] Höfn í Hornafirði
- [ ] Egilsstaðir
- [ ] Ísafjörður
- [ ] Stykkishólmur
- [ ] Flúðir
- [ ] Skógar / Skógafoss
- [ ] Þingvellir
- [ ] Geysir / Gullfoss
- [ ] Jökulsárlón
- [ ] Landmannalaugar

> **Stebbi svarar:** Haka við þá sem eiga að vera með, eða skrifar þína lista. Fáir og réttir eru betri en margir og óreiknaðir.

---

## Spurning 3 — Latest-departure

`findLatestDeparture` svarar spurningum eins og: "Hvenær get ég lagt af stað í síðasta lagi með hjólhýsið frá Reykjavík að Apavatni?"

- [ ] **Já — í Phase 2A3** (saman með route weather)
- [ ] **Nei — seinna verkefni** (route weather ships án þessa fyrst)

> **Stebbi svarar.**

---

## Framkvæmdarleyfi

Þegar Stebbi hefur svarað spurningum 1–3:

**Phase 2A1** (golf + intent, engir Google lyklar, engar dependencies):

> Stebbi skrifar: "Claude Code, framkvæmdu Phase 2A1"

---

## Hvað Phase 2A1 inniheldur (til minningar)

- Golf intent detection og evaluator (best gluggi + alternatives)
- Route intent detection → skilar "provider ekki stilltur" (ekki fake veður)
- Uppfærsla á `places.ts` með golf courses og ferðamannastaðum úr svörum Stebba
- Messages fyrir golf svör, óþekktan stað, provider ekki stilltur
- ~30–35 tests

Engin Google API köll. Engar nýjar dependencies. Engar SQL breytingar.

---

## Localhost checks for Stebbi (Phase 2A1)

Þegar Claude Code er búinn:

1. `Hvenær er best að spila golf í Grafarholti á morgun?` → best gluggi + alternatives, vindrökstuðningur
2. 10–11 m/s vindur → ekki rautt sjálfkrafa
3. Golfvöllur sem er ekki í listanum → "þetta staðarheiti þekki ég ekki"
4. `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?` → "provider ekki stilltur" — ekkert fake veður
5. `Er grillveður í Mosó í kvöld?` → virkar eins og áður (regression)
