# Handoff: WORKFLOW.md - rýni Codex

**Created:** 2026-06-27 17:50  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Review / handoff - engin framkvæmd

---

## Samhengi

Stebbi bað Codex að rýna handoff frá Claude Code:

- `ai-handoff/2026-06-27-1746-workflow-v001-claude-workflow-md-review.md`

Claude Code hafði búið til eða breytt:

- `WORKFLOW.md`
- `CLAUDE.md`
- `AGENTS.md`

Markmiðið er að setja fastar vinnureglur í repo svo Codex og Claude Code fari
síður út fyrir hlutverk sín, sérstaklega varðandi muninn á ráðgjöf, rýni,
handoff, framkvæmd, commit, push, deploy og migrations.

Codex gerði aðeins rýni. Codex breytti ekki `WORKFLOW.md`, `CLAUDE.md` eða
`AGENTS.md` í þessari rýni.

---

## Findings

### 1. `stórar kóðabreytingar` opnar óþarft grátt svæði

**Staður:** `WORKFLOW.md`, kaflarnir `Hlutverk` og `Framkvæmdarleyfi`.

Textinn segir að Claude Code megi ekki framkvæma `stórar kóðabreytingar` án
leyfis. Þetta er veikara en upphafsreglan í `Session mode / vinnuhamur`, þar sem
skjalabreytingar, migration-skrif og aðrar breytingar eru bannaðar án skýrs
leyfis.

**Tillaga:** Nota alls staðar skýrara orðalag:

```md
Claude Code og Codex mega ekki framkvæma kóðabreytingar, skráabreytingar eða
skrifa migration nema Stebbi segi skýrt að viðkomandi eigi að framkvæma
afmarkað verk.
```

Þetta lokar spurningunni um hvað telst `stórt`.

### 2. `skýrt grænt ljós` er of óljóst

**Staður:** `WORKFLOW.md`, kaflarnir `Hlutverk` og `Meginregla`.

Skjalið gerir annars mjög góða kröfu um nákvæmt framkvæmdarleyfi eins og
`Claude Code, framkvæmdu [tiltekið verk]`. Orðalagið `skýrt grænt ljós` er
óþarflega opið og gæti aftur orðið túlkað sem `flott`, `samþykkt`, `virkar` eða
annað momentum-svar.

**Tillaga:** Skipta `skýrt grænt ljós` út fyrir:

```md
skýrt og afmarkað framkvæmdarleyfi frá Stebba
```

eða:

```md
setningu á borð við: "Claude Code, framkvæmdu [tiltekið verk]."
```

### 3. Tilvísun í `WORKFLOW.md` er góð, en ekki fullkomin trygging

**Staður:** `CLAUDE.md` og efst í `AGENTS.md`.

Það er gott að bæði skjölin vísi í `WORKFLOW.md`. Óvissan er hvort Claude Code
og Codex lesi alltaf tilvísaðar skrár sjálfkrafa í öllum aðstæðum. Þetta er
sérstaklega mikilvægt eftir context compaction eða nýtt session.

**Tillaga:** Hafa stutta hard-stop blokk beint í bæði `CLAUDE.md` og
`AGENTS.md`, áður en vísað er í `WORKFLOW.md`.

Dæmi:

```md
## Hard stop

Sjálfgefinn vinnuhamur er ráðgjöf, rýni og planagerð.
Claude Code/Codex má ekki breyta skrám, skrifa migration, keyra migration,
commit-a, push-a, deploya eða gera production-breytingar nema Stebbi gefi skýrt
og afmarkað framkvæmdarleyfi.

"Rýni", "plan", "handoff", "skoða", "meta stöðu" og sambærilegt eru ekki
framkvæmdarleyfi.

Ef vafi er á leyfi, er svarið nei.
```

Síðan getur skjalið sagt: `Fullar reglur eru í WORKFLOW.md`.

### 4. Vantar reglu um staðfestingarsvör

**Staður:** `WORKFLOW.md`, kaflinn `Hard stop / samþykktarhlið`.

Í þessari lotu sást að svör eins og `virkar`, `flott`, `samþykkt` eða
`LGTM` geta auðveldlega ýtt agent áfram í næsta skref. Skjalið stoppar mörg
óljós orð, en ekki þessi staðfestingarsvör.

**Tillaga:** Bæta við:

```md
"Virkar", "flott", "samþykkt", "LGTM" eða staðfesting á niðurstöðu er ekki
leyfi fyrir næsta framkvæmdarskrefi, commit, push, deploy eða migration.
```

---

## Mat á skiptingu skjalanna

Skiptingin er skynsamleg:

- `WORKFLOW.md`: meginreglur um hlutverk, samþykki og vinnuham.
- `AGENTS.md`: verkefnis- og Codex-context, tæknileg verkefnisviðmið og
  repo-reglur.
- `CLAUDE.md`: inngangur fyrir Claude Code sem vísar í reglurnar.

Codex myndi ekki setja allt `WORKFLOW.md` inn í `AGENTS.md` eða `CLAUDE.md`.
Það myndi auka tvítekningu og hættu á að skjölin fari úr sync. Betra er að hafa
stutta hard-stop samantekt í `AGENTS.md` og `CLAUDE.md`, og fulla útgáfu í
`WORKFLOW.md`.

---

## Svar við spurningum Claude Code

### Er `WORKFLOW.md` rétt og tæmandi?

Nánast. Helstu göt eru:

- `stórar kóðabreytingar`
- `skýrt grænt ljós`
- staðfestingarsvör eins og `virkar` / `flott` / `LGTM`
- óvissa um hvort tilvísaðar skrár séu lesnar sjálfkrafa

### Er skipting `CLAUDE.md` / `AGENTS.md` / `WORKFLOW.md` skynsamleg?

Já. Codex mælir með þessari skiptingu, en með stuttri hard-stop blokk í
`CLAUDE.md` og `AGENTS.md`.

### Er tilvísunin efst í `AGENTS.md` nógu skýr?

Hún er skýr, en ekki nógu sjálfbær ef agent les ekki tilvísaða skrá. Bæta við
hard-stop samantekt.

### Vantar eitthvað úr þessari lotu?

Já, reglan um að `virkar`, `flott`, `samþykkt` og sambærileg svör séu ekki
framkvæmdarleyfi fyrir næsta skref.

---

## Tillaga að næsta skrefi

Claude Code ætti að uppfæra `WORKFLOW.md`, `CLAUDE.md` og `AGENTS.md` með
punktunum hér að ofan, en aðeins eftir skýrt framkvæmdarleyfi frá Stebba.

Ef Stebbi vill láta Claude Code framkvæma, væri skýrt leyfi:

```md
Claude Code, framkvæmdu workflow-skerpingarnar úr
`ai-handoff/2026-06-27-1750-workflow-v002-codex-workflow-md-review.md`.
Ekki commit-a, push-a eða deploya.
```

---

## Hvað Codex gerði

- Las `ai-handoff/2026-06-27-1746-workflow-v001-claude-workflow-md-review.md`.
- Las `WORKFLOW.md`.
- Las `CLAUDE.md`.
- Las upphaf og viðeigandi hluta `AGENTS.md`.
- Skoðaði diff á `AGENTS.md`, `CLAUDE.md` og `WORKFLOW.md`.
- Bjó til þessa handoff-skrá.

## Hvað Codex gerði ekki

- Codex breytti ekki `WORKFLOW.md`.
- Codex breytti ekki `CLAUDE.md`.
- Codex breytti ekki `AGENTS.md`.
- Codex commit-aði ekki.
- Codex push-aði ekki.
- Codex deployaði ekki.
- Codex keyrði ekki migration eða Supabase skipanir.

## Skipanir sem Codex keyrði

- `Get-ChildItem -Recurse -File | Where-Object { $_.Name -eq '2026-06-27-1746-workflow-v001-claude-workflow-md-review.md' } | Select-Object FullName,Length`
- `Get-Content -Encoding UTF8 AGENTS.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-06-27-1746-workflow-v001-claude-workflow-md-review.md`
- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 CLAUDE.md`
- `git diff -- AGENTS.md CLAUDE.md WORKFLOW.md`
- `git status --short AGENTS.md CLAUDE.md WORKFLOW.md`
- `Get-Date -Format yyyy-MM-dd-HHmm`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-ChildItem -File ai-handoff | Where-Object { $_.Name -like '*workflow*' } | Sort-Object Name | Select-Object Name,Length`

Allar skipanir voru read-only nema þessi skrá var búin til með `apply_patch`.

---

## Localhost checks for Stebbi

Þetta á ekki við sem venjulegt browser- eða localhost-próf, því breytingin er
verklags- og skjalarýni en ekki notendasýnileg app-breyting.

Það sem Stebbi getur samt staðfest handvirkt:

1. Opna `WORKFLOW.md`, `CLAUDE.md` og `AGENTS.md`.
2. Athuga hvort hard-stop reglurnar séu nógu sýnilegar í upphafi skjala.
3. Byrja nýtt Claude Code eða Codex session síðar og staðfesta að agent lesi eða
   virði `WORKFLOW.md`.
4. Prófa með óljósri beiðni eins og `skoðaðu þetta` eða `búa til handoff` og
   staðfesta að agent framkvæmi ekki kóðabreytingu án skýrs leyfis.

Engin Supabase, auth, RLS, production gögn, secrets, billing eða deployment
ættu að verða fyrir áhrifum af þessari skjalarýni.

---

## Óvissa / þarf að staðfesta

- Óvíst er hvort Claude Code og Codex lesi alltaf tilvísaða `WORKFLOW.md` skrá
  sjálfkrafa í öllum sessions. Confidence: medium.
- Þess vegna er mælt með stuttri hard-stop blokk í `CLAUDE.md` og `AGENTS.md`,
  ekki aðeins tilvísun í `WORKFLOW.md`.
