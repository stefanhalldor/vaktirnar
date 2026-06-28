# Handoff: WORKFLOW.md - rýni Codex

**Created:** 2026-06-27 17:46
**Timezone:** Atlantic/Reykjavik
**Frá:** Claude Code
**Til:** Codex
**Tegund:** Rýni - engin framkvæmd

---

## Samhengi

Stebbi hefur verið að líma vinnureglur handvirkt inn í upphaf hvers samtals.
Í dag var ákveðið að koma þeim í föstu skjalakerfi svo bæði Claude Code og
Codex lesi þær sjálfkrafa.

Claude Code bjó til þrjár skrár:

1. **`WORKFLOW.md`** - nýtt skjal með öllum vinnureglum
2. **`CLAUDE.md`** - nýtt skjal sem vísar í `WORKFLOW.md` (Claude Code les þetta sjálfkrafa)
3. **`AGENTS.md`** - tilvísun í `WORKFLOW.md` bætt efst (Codex les þetta sjálfkrafa)

Engar kóðabreytingar. Engin migration. Engin commit eða push enn.

---

## Hvað Codex á að rýna

### 1. Er WORKFLOW.md rétt og tæmandi?

Textinn í `WORKFLOW.md` kom frá Stebba (sama texti og hann hefur verið að líma).
Codex á að skoða hvort:

- Eitthvað í AGENTS.md sem er ekki í WORKFLOW.md og ætti að vera þar
- WORKFLOW.md sé í mótsögn við AGENTS.md að einhverju leyti
- Eitthvað sé óljóst eða gæti túlkast á villandi hátt
- Einhverjar reglur í AGENTS.md eigi heima í WORKFLOW.md frekar en AGENTS.md

### 2. Er skipting CLAUDE.md / AGENTS.md / WORKFLOW.md skynsamleg?

Núverandi uppsetning:
- `WORKFLOW.md` - allar vinnureglur
- `CLAUDE.md` - aðeins tilvísun í WORKFLOW.md + vísar í AGENTS.md
- `AGENTS.md` - tilvísun í WORKFLOW.md efst, síðan tæknileg verkefnisupplýsingar

Spurningar:
- Er CLAUDE.md of þunnt? Á það að innihalda meira?
- Á AGENTS.md að vísa í WORKFLOW.md eða á WORKFLOW.md að vera hluti af AGENTS.md?
- Þarf Codex að lesa bæði AGENTS.md og WORKFLOW.md til að vera fullbúinn?

### 3. Er tilvísunin efst í AGENTS.md nógu skýr?

Núverandi texti:
```
> **Skylda:** Codex og Claude Code skulu fylgja verklaginu í `WORKFLOW.md`
> í öllum samtölum. Lesið `WORKFLOW.md` við upphaf hvers session.
```

Er þetta skýrt og nógu áberandi?

### 4. Vantar eitthvað sem kom fram í þessari lotu?

Í þessari lotu kom í ljós að:
- "gefðu út" var túlkað sem framkvæmdarleyfi þegar það var ekki
- Staðfestingaryfirlit áður en framkvæmd hefst var ekki alltaf gert

Er þetta nægilega skýrt í WORKFLOW.md? Þarf að bæta við dæmum?

---

## Skrár sem voru búnar til/breyttar

- `WORKFLOW.md` - búið til (nýtt)
- `CLAUDE.md` - búið til (nýtt)
- `AGENTS.md` - tilvísun bætt efst

---

## Hvað var EKKI gert

- Engin commit
- Engin push
- Engar breytingar á kóðaskrám
- Engar breytingar á TODO.md eða DONE.md

---

## Óvissa / þarf að staðfesta

- Óvíst hvort Claude Code les `WORKFLOW.md` sjálfkrafa þegar `CLAUDE.md` vísar í hana, eða hvort Claude Code þarf að lesa hana sérstaklega. **Confidence: medium.** Sama spurning gildir um Codex og AGENTS.md.
- Ef aðilar lesa ekki tilvísaðar skrár sjálfkrafa þarf annaðhvort að setja reglurnar beint í CLAUDE.md og AGENTS.md, eða biðja um að þær séu lesnar í upphafi samtals.
