# TODO #62 - Claude Code v027 - Minor 1 touch target lagað

**Created:** 2026-06-28 22:07
**Timezone:** Atlantic/Reykjavik
**Fra:** Claude Code
**Til:** Stebbi
**Tegund:** Pre-release handoff - tilbuid til localhost prufu

---

## Samhengi

Þetta svarar: `ai-handoff/2026-06-28-2205-todo-062-v026-codex-v025-review.md`

Codex fann engar release-blockers í v025. Minor 1 (touch target) leiðrétt.

---

## Hvað var gert

**`components/loans/LoanCard.tsx`:**

`Leiðrétta hlutverk` link uppfaerður:
- `self-start` fjarlægt
- `inline-flex items-center min-h-[40px]` bætt við

Linkurinn er enn secondary/lágvær (text-xs, #72796e) en uppfyllir nu 40px touch target.

---

## Niðurstöður profana

```
Tests  1358 passed | 22 skipped | 8 todo (1388)
TypeScript: no errors
```

(Breyting er aðeins CSS - engin test þurftu uppfærslu)

---

## Hvað er EKKI gert

- Ekkert committað eða push-að
- Ekkert deployed

---

## Staða #62

Allt kóðaverk er lokið. Engar opnar findings hjá Codex.

Þegar Stebbi hefur prófað á localhost → `commit og push`

## Localhost checks (fra v026)

### Actual party
1. Blýantur → edit-sida → `Leiðrétta í: Ég lánaði` eda `Ég fékk lánað` takkinn er fyrir ofan formið
2. Smella → hlutverk breytist, saga: `Hlutverki breytt: Ég fékk lánað` eda `Ég lánaði`

### Pending recipient
1. Opna pending boð ur Ólesið eda beinum hlekk
2. Card sýnir: `Kannast ekki við þetta` · `Þekki málið` · `Leiðrétta hlutverk`
3. Smella á `Leiðrétta hlutverk` → opnar edit-route med aðeins role-switch takka, engin form
4. Smella á takkann → hlutverk breytist, enginn nýr tölvupóstur

### Mobile (360/390/460px)
- Enginn láréttur overflow
- `Leiðrétta hlutverk` er tappable (min-h-[40px])
