# TODO-091 v008 — Aðskilin kort-toggle og vindáttarör

## Plan áfangans

1. Fjarlægja sameiginlega Kort-flipann úr top navigation.
2. Gefa Spá og Akstri hvort sitt kort/tölur-toggle.
3. Tryggja að neðri kortstýringar fylgi virku samhengi.
4. Umbreyta vindátt í gráðum yfir í ör í stað hrárrar tölu.
5. Keyra type-check, preference-próf og production build.

## Hvað var raunverulega gert

- Sameiginlegi „Kort“ flipinn var fjarlægður úr top navigation.
- Spá og Akstur haldast merkt sem virkur meginkafli bæði í töflu- og kortasýn.
- Bætt var við sticky/floating Íslandskorts-hnappi innan virks meginkafla:
  - úr tölusýn opnar hann kort viðkomandi kafla;
  - úr kortasýn fer sami hnappur aftur í tölurnar;
  - hnappurinn hefur sýnilegan texta, tooltip og þýtt `aria-label`.
- Spá og Akstur nota aðskilda toggle-handlers sem stilla kortasamhengið áður en lög og markerar eru birt.
- Neðri akstursstýringar birtast nú aðeins þegar `lastMapContext === 'route'`. Reiknuð leið getur því ekki lengur látið Spá-kortið líta út eins og Aksturskort.
- Route-loader í kortasýn er einnig bundinn við Aksturssamhengið.
- `windDirectionTextToArrow` les nú bæði íslenska vindátt og gráðutölu, til dæmis `344` eða `344°`, og sýnir samsvarandi ör. Óþekktur texti verður punktur en ekki hrátt gildi.
- Bætt var við íslenskum og enskum textum fyrir „Sýna kort“ og „Sýna tölur“.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-1616-todo-091-v008-codex-context-map-toggles-wind-arrow.md`

Ótengdar breytingar á `.obsidian/workspace.json` og endurnefning v006 handoffs úr `1430` í `1400` voru ekki gerðar eða snertar af Codex.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 3 af 3 prófum stóðust.
- `npm.cmd run build`
  - Exit code 0.
  - Production build kláraðist; aðeins fyrirliggjandi lint-viðvaranir birtust.
- `git diff --check`
  - Engar whitespace-villur; line-ending og global git-ignore permission viðvaranir birtust.

## Hvað mistókst eða var sleppt

- Engin skipun mistókst.
- Browser-/sjónræn prófun var ekki keyrð þar sem Stebbi stýrir localhost.
- Ekki var bætt við DOM-prófi fyrir MapLibre markerana eða floating toggle.
- Ekkert commit, push eða deploy var gert.

## Ákvarðanir

- Top navigation lýsir nú meginkafla, ekki undirsýn. Þess vegna helst Spá eða Akstur virkt þegar kort viðkomandi kafla er opið.
- Kort/tölur-toggle er context-aware en handlers eru aðskildir. Þetta kemur í veg fyrir að sameiginlegur Kort-flipi þurfi að giska á state.
- Íslandstáknið er létt inline SVG svo ekki þurfi nýtt bitmap-asset eða auka dependency.
- Hnappurinn er minnst 48 px og með texta/aðgengismerkingum í samræmi við mobile-app viðmið `Design.md`.

## Áhætta sem er enn til staðar

- Nákvæm staðsetning floating hnappsins þarf sjónræna staðfestingu á litlum skjá og við opnar stillingar/leitarniðurstöður.
- Íslandslögunin er einfölduð táknmynd, ekki landfræðilega nákvæm.
- MapLibre layer/marker aðskilnaður er áfram best staðfestur með browser-prófi.
- Fyrirliggjandi React Hook dependency lint-viðvaranir eru óbreyttar.

## Tillaga að næsta skrefi

Keyra localhost-prófin hér að neðan. Ef toggle skarast við efni á ákveðinni skjástærð skal aðeins færa staðsetninguna eða þétta hnappinn, ekki sameina kort-state aftur.

## Spurningar fyrir næstu rýni

1. Er floating Íslandskorts-hnappurinn á eðlilegum stað í bæði Spá og Akstri?
2. Er nægilega skýrt að sami hnappur skiptir milli korts og talna?
3. Er vindáttarörin rétt fyrir dæmið `344` og aðrar höfuð-/millivindáttir?

## Supabase

Engin SQL-skrá var skrifuð eða keyrð. Engar breytingar voru gerðar á gögnum, RLS, auth, grants, policies, functions eða production.

## Localhost checks for Stebbi

Slóð:

`/auth-mvp/vedrid/road-map-prototype`

Nauðsynlegt state:

- Innskráður notandi með Spá-staði.
- Reiknuð akstursleið með Vegagerðarstöðvum, helst leiðin úr skjámynd 2026-07-24 160711.

Skref og vænt niðurstaða:

1. Opnaðu síðuna í mobile breidd.
   - Top navigation á að sýna Spá, Skilaboð og Akstur; engan sameiginlegan Kort-flipa.
   - Spá á að vera virk og tölurnar sýnilegar.
2. Smelltu á litla Íslandskortið í Spá.
   - Spá helst virkur top-flipi.
   - Spá-kort og Spá-spjöld birtast.
   - Engin akstursleið, Vegagerðar-pillur eða akstursscrubber mega sjást.
3. Smelltu aftur á sama hnapp.
   - Farið er aftur í Spá-tölurnar.
4. Opnaðu Akstur og reiknaða leið.
   - Akstur verður virkur top-flipi og aksturstölurnar sjást.
5. Smelltu á Íslandskortið í Akstri.
   - Akstur helst virkur.
   - Leið, akstursstýringar og rétt stöðvarspjöld birtast.
   - Spá-markerar mega ekki sjást.
6. Smelltu aftur á hnappinn.
   - Farið er aftur í Aksturstölurnar.
7. Veldu „Vegagerðin“ og skoðaðu spjaldið við Staðarskála úr skjámyndinni.
   - `344` á ekki að sjást fyrir framan vindhraðann.
   - Vindáttarör á að sjást í staðinn.
8. Skiptu nokkrum sinnum Spá → kort → tölur → Akstur → kort → tölur.
   - Hvor kafli á alltaf að halda sínu rétta kortasamhengi.
9. Prófaðu einnig desktop breidd.
   - Toggle má ekki hylja mikilvægt control, leitarreit eða scrollbar.

Helstu regressions:

- Aksturs-pillur eða leið birtist í Spá-korti.
- Spá-markerar birtast á Aksturskorti.
- Top-flipi missir active state þegar kort er opnað.
- Floating hnappur veldur overlap-i eða verður ótappanlegur.
- Vindátt birtist aftur sem gráðutexti.
