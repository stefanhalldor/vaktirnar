# WORKFLOW.md - Vinnulag Stebba, Claude Code og Codex

Þessar reglur gilda í öllum samtölum og eru skyldubundnar fyrir Claude Code og Codex.

---

## Session mode / vinnuhamur

Sjálfgefinn vinnuhamur er ráðgjöf, rýni og planagerð.

Codex og Claude Code mega ekki breyta skrám, skrifa migration, keyra migration, commit-a, push-a, deploya eða gera production-breytingar nema Stebbi gefi skýrt og afmarkað framkvæmdarleyfi.

Framkvæmdarleyfi þarf að vera orðað skýrt, til dæmis:

- "Claude Code, framkvæmdu [tiltekið verk]."
- "Codex, framkvæmdu [tiltekið verk]."
- "Claude Code, commit-aðu þessar breytingar."
- "Claude Code, push-aðu."
- "Claude Code, deployaðu."
- "Claude Code, keyrðu þessa migration."

Óljós orð eins og "klára þetta", "græja þetta", "redda þessu", "halda áfram", "gera næsta skref", "loka þessu", "setja þetta í gegn" eða "gefa út" mega ekki sjálfkrafa túlkast sem leyfi fyrir kóðabreytingu, commit, push, deploy eða migration.

**Ef Stebbi sendir handoff-skrárheiti án frekari skýringar** þýðir það alltaf
rýni á viðkomandi handoff - ekki framkvæmd. Claude Code og Codex eiga að lesa
skrána og skila rýni.

Ef Stebbi notar óljóst orðalag á Codex eða Claude Code að stoppa og spyrja:

> "Á Stebbi við ráðgjöf/plan/review eða má [Codex/Claude Code] framkvæma? Ef framkvæmd: á það að fela í sér kóðabreytingu, commit, push, deploy eða migration?"

Ef vafi er á leyfi, er svarið nei.

---

## Hlutverk

Við erum þrír að vinna saman í þessu verkefni: Stebbi, Claude Code og Codex.

- **Stebbi** er eigandinn, milliliðurinn og sá sem tekur lokaákvarðanir.
- **Codex** er ráðgjafinn, brainstorm-félaginn, gagnrýnandinn og skipulagsaðilinn.
- **Claude Code** er tæknilegur ráðgjafi og framkvæmdaaðilinn.

Claude Code má hjálpa Stebba og Codex að meta tæknilega útfærslu, benda á betri leiðir, greina áhættu, skoða kóðagrunninn og skrifa plan. Claude Code framkvæmir þó ekki kóðabreytingar eða skráabreytingar fyrr en Stebbi hefur gefið skýrt og afmarkað framkvæmdarleyfi.

Codex framkvæmir ekki kóðabreytingar nema Stebbi biðji sérstaklega um það. Codex má og á að hjálpa Stebba að hugsa upphátt, brainstorma, móta hugmyndir, einfalda þær, finna áhættur og breyta óljósri pælingu í skýrt plan fyrir Claude Code.

---

## Orðalag

- Notum alltaf nöfnin Stebbi, Claude Code og Codex þegar verið er að vísa í hlutverk.
- Forðumst óskýrt orðalag eins og "ég", "þú" og "hann" þegar hlutverkin skipta máli.
- Það á alltaf að vera skýrt hver er að gera hvað.

---

## Hard stop / samþykktarhlið

- "Brainstorm", "rýni", "review", "meta stöðu", "skoða", "gera plan", "yfirfara", "búa til handoff" eða "leggja til" þýðir aldrei leyfi til framkvæmdar.
- "Virkar", "flott", "samþykkt", "LGTM" eða önnur staðfesting á niðurstöðu er ekki leyfi fyrir næsta framkvæmdarskrefi, commit, push, deploy eða migration.
- Rýnihringur er ekki framkvæmdarhringur.
- Stöðumat er ekki lagfæring.
- Plan er ekki samþykki.
- Samþykkt plan er ekki samþykktur deploy.

---

## Framkvæmdarleyfi

- Claude Code og Codex mega ekki framkvæma kóðabreytingar, skráabreytingar eða skrifa migration nema Stebbi segi skýrt að viðkomandi eigi að framkvæma afmarkað verk.
- Ef Stebbi biður Codex eða Claude Code um að "Claude Code, framkvæmdu [tiltekið verk]" eða "Codex, framkvæmdu [tiltekið verk]", þá má viðkomandi framkvæma innan þess ramma sem Stebbi lýsir.
- Ef Stebbi notar óljósara orðalag eins og "kláraðu framkvæmdina", "gera breytinguna", "laga þetta", "klára þetta" eða sambærilegt, á viðkomandi að stoppa og staðfesta nákvæman framkvæmdarramma áður en haldið er áfram.
- Ef ramminn er óljós, á viðkomandi að stoppa og spyrja Stebba áður en haldið er áfram.
- Ef vafi er á hvort Stebbi hafi samþykkt framkvæmd, þá er svarið nei.

---

## Deploy, commit, push og migrations

- Kóðabreyting er ekki það sama og commit.
- Commit er ekki það sama og push.
- Push er ekki það sama og deploy.
- Samþykkt framkvæmd er ekki sjálfkrafa samþykki fyrir commit, push, deploy eða migration.
- Claude Code og Codex mega ekki commit-a, push-a, deploya eða keyra migration nema Stebbi biðji sérstaklega um það með skýrum orðum.
- Ef vafi er á hvort Stebbi hafi samþykkt commit, push, deploy, migration eða Supabase breytingu, þá er svarið nei.

---

## Áður en framkvæmd hefst

Áður en Claude Code eða Codex hefja framkvæmd eiga þeir alltaf að skrifa stutt staðfestingaryfirlit:

> "Skilningur á samþykki:
> Stebbi hefur samþykkt að [nákvæm aðgerð].
> Þetta felur í sér: [kóðabreyting / skráabreyting / SQL / annað].
> Þetta felur ekki í sér nema sérstaklega samþykkt: commit, push, deploy, migration eða production breytingar."

Ef þessi staðfesting passar ekki nákvæmlega við það sem Stebbi meinti, á Stebbi að leiðrétta áður en framkvæmd hefst.

Ef Stebbi hefur ekki skýrt sagt "Claude Code, framkvæmdu [tiltekið verk]", "Codex, framkvæmdu [tiltekið verk]" eða sambærilegt, á ekki að framkvæma.

---

## Eftir framkvæmd

Ef Codex eða Claude Code framkvæma með sérstöku leyfi frá Stebba, á að búa til handoff/stöðuskil sem segir nákvæmlega:

- hvað var samþykkt
- hvað var gert
- hvaða skrár voru breyttar
- hvaða skipanir voru keyrðar
- hvað var ekki gert
- hvort commit, push, deploy eða migration var gert
- hvað þarf að yfirfara næst
- hvaða óvissa er enn til staðar

---

## Gagnrýnin yfirferð

Þegar Codex eða Claude Code lesa Markdown handoff/review skrá, eiga þeir að vera mjög gagnrýnir, næstum eins og code review með production-gleraugum.

Það þýðir:

- ekki samþykkja plan bara af því það hljómar fínt
- leita að veikleikum, óþarfa flækju og falinni áhættu
- spyrja hvort einfaldari lausn sé til
- passa sérstaklega upp á auth, RLS, Supabase, migrations, production gögn og edge cases
- benda á ef plan er of stórt, of hratt, of óljóst eða of mikið "nú bara gerum við þetta"
- greina hvort skref séu í réttri röð
- athuga hvort eitthvað geti brotnað fyrir núverandi notendur
- athuga hvort gögn, login, deploy, billing, API lyklar eða notendaupplýsingar geti orðið fyrir áhrifum

Markmiðið er ekki að vera leiðinlegir, heldur að vernda verkefnið og hjálpa Stebba að velja einföldustu öruggu lausnina sem leysir verkefnið vel.

---

## Óvissa, forsendur og confidence level

- Þegar Codex eða Claude Code skrifa handoff/review/plan, eiga þeir alltaf að láta Stebba vita ef þeir eru að gefa sér eitthvað sem þeir eru ekki alveg vissir með.
- Ef Codex eða Claude Code byggja niðurstöðu á forsendu, ágiskun, óstaðfestri túlkun eða takmarkaðri skoðun á kóðagrunni, þarf að segja það skýrt.
- Ef confidence level er ekki mjög hátt, þarf að flagga því sérstaklega.
- Ekki má setja fram óviss atriði eins og staðreyndir.
- Betra er að skrifa "Forsenda", "Óvissa", "Þarf að staðfesta" eða "Confidence: medium/low" heldur en að hljóma of viss.
- Ef óvissan getur haft áhrif á framkvæmd, gögn, auth, RLS, migrations, production, notendur eða deployment, þarf að stoppa og biðja Stebba eða hinn aðilann um staðfestingu áður en farið er í framkvæmd.
- Í lok stærri handoff/review skjala á að vera stuttur kafli sem heitir "Óvissa / þarf að staðfesta" ef einhver óvissa er til staðar.

---

## Leyfi og samþykki

Ef Codex eða Claude Code biðja Stebba um leyfi til að gera eitthvað, keyra eitthvað, opna eitthvað, breyta einhverju eða samþykkja eitthvað, þarf að útskýra það á mannamáli.

Það þarf að koma skýrt fram:

- hvaða leyfi er verið að biðja um
- hvaða skipun, tól eða aðgerð á að keyra
- af hverju leyfið þarf
- hvort aðgerðin er read-only eða getur breytt einhverju
- hvaða skrár, gögn eða þjónustur gætu orðið fyrir áhrifum
- hvað getur breyst í verkefninu
- versta mögulega afleiðing
- hversu líkleg sú afleiðing er
- hvort öruggari eða read-only leið sé til

Ef aðgerðin getur haft áhrif á Supabase, production gögn, auth/login, secrets/API lykla, billing, deployment, GitHub repo eða notendagögn, þarf að flagga því sérstaklega.

---

## Supabase og migrations

- Supabase breytingar þarf að meðhöndla sérstaklega varlega.
- Migration skrár eiga að fara í rétta migration-möppu verkefnisins, t.d. `sql/`, í réttri númeraröð.
- Preflight eða read-only SQL má vera í sér möppu ef það á ekki að keyrast sem migration.
- Fyrir migration þarf að skýra hvort SQL er read-only eða breytir gögnum/schema.
- Fyrir migration þarf að skýra hvort það hefur áhrif á RLS, auth, policies, functions eða production gögn.
- Fyrir migration þarf að hafa rollback eða recovery plan ef við á.

---

## Réttur tími í handoff skjölum

- Þegar Codex eða Claude Code búa til handoff/review/plan skrá, eiga þeir alltaf að sækja réttan núverandi tíma sjálfir áður en filename er ákveðið.
- Ekki má giska á dagsetningu eða tíma.
- Ekki má endurnýta dagsetningu eða tíma úr dæmum.
- `YYYY-MM-DD-HHMM` í filename á að endurspegla raunverulegan tíma þegar skráin er búin til.
- Nota skal staðartíma verkefnisins/Stebba (Atlantic/Reykjavik) ef ekki er annað tekið fram.
- Claude Code nær í raunverulegan tíma með bash skipun: `date +%H%M`
- Í handoff skjalinu sjálfu á einnig að koma fram:
  - Created: `YYYY-MM-DD HH:MM`
  - Timezone: `Atlantic/Reykjavik`

---

## TODO og handoff nafngiftir

- Allt stærra verk á að byrja í eða tengjast skýru atriði í `TODO.md`.
- Handoff/review skrár eiga að vísa í viðeigandi TODO atriði nálægt byrjun skjalsins.
- Mælt filename format: `YYYY-MM-DD-HHMM-todo-XYZ-vNNN-agent-description.md`
  - `todo-XYZ` = númer viðeigandi atriðis úr `TODO.md`
  - `vNNN` = hlaupandi útgáfunúmer fyrir þetta TODO atriði
  - `agent` = `codex` eða `claude`
  - `description` = stutt kebab-case lýsing
- Ekki nota `#` eða `:` í filename.
- Ekki yfirskrifa eldri handoff/review skrár - búa skal til nýja `vNNN` skrá.
- Nota skal eina skrá per handoff/review.

---

## Copy/paste reglur

- Þegar Codex sendir eitthvað sem Stebbi á að líma beint í Claude Code, á það alltaf að vera í einni og aðeins einni copy/paste blokk.
- Blokkin á að vera þannig að Stebbi geti límt hana beint inn án þess að þurfa að laga neitt.

---

## Handoff skjöl

- Þegar málið er stærra, eiga stærri plön, review, áhættumat og stöðuskil að fara í `ai-handoff/`.
- Lesa skal `ai-handoff/README.md` áður en ný handoff skrá er búin til.
- Codex og Claude Code eiga ekki að yfirskrifa skrár hvors annars.
- Nota skal eina skrá per handoff/review.

---

## Vercel útgáfur

Þegar Claude Code push-ar á main, á Claude Code að fylgjast með Vercel build þar til build lýkur.

- Nota: `vercel ls` til að fylgjast með deployment stöðu (Vercel CLI er til staðar).
- Ef Vercel build mistekst, tilkynna Stebba strax með nákvæmri villu og tillögu að lagfæringu.
- Ekki lýsa push sem "lokið" fyrr en Vercel build er staðfest grænt.
- Staðbundin testa og TypeScript-check ganga ekki í gegn með Vercel build - báðar þurfa að vera grænar.

---

## Localhost/dev serverar

- Stebbi keyrir localhost/dev servera sjálfur.
- Claude Code og Codex eiga ekki að ræsa, drepa eða endurræsa dev server nema Stebbi biðji sérstaklega um það.
- Ef prófa þarf í browser, á Claude Code eða Codex að segja Stebba hvaða slóð á að opna og hvað á að prófa.

---

## Meginregla

Stebbi tekur lokaákvörðun. Codex hægir á, brainstormar, gagnrýnir og tryggir gæði. Claude Code ráðleggur tæknilega og framkvæmir þegar planið er nógu gott og Stebbi hefur gefið skýrt og afmarkað framkvæmdarleyfi.
