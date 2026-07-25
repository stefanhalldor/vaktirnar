# TODO-091 — Public staðir og föst Aksturskortslög

Created: 2026-07-25 11:07  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi bað Codex að framkvæma breytingarnar hratt á localhost:

- geyma staði public notanda í `sessionStorage`
- bjóða innskráningu til varanlegrar vistunar
- sameina public staði við staði innskráðs notanda án þess að yfirskrifa eða eyða fyrirliggjandi stöðum
- halda áfram núverandi autosave eftir innskráningu
- fjarlægja rofa, skýringar og talningar neðst á Aksturskortinu
- hafa vegakerfi og vegfærð alltaf sýnileg á Aksturskortinu en ekki Spákortinu

Ekki var samþykkt commit, push, deploy, migration eða production-/Supabase-breyting.

## Plan

1. Nota tab-bundið `sessionStorage` fyrir public staði.
2. Sameina þá í gegnum afmarkað `mergeOnly` API-contract eftir innskráningu.
3. Vernda eldri server-staði og geyma ósameinaða staði áfram í sessioni ef 50 staða hámarkið er fullt eða kall mistekst.
4. Festa vegalög við Aksturskort og fjarlægja neðri stjórnröð.
5. Keyra hröð, afmörkuð checks.

## Hvað var gert

- Public staðir eru lesnir, uppfærðir og fjarlægðir í `sessionStorage`.
- Vistaðir public staðir haldast við flipaskipti og endurhleðslu innan sama browser-flipa.
- Public notandi fær skýran texta um tímabundna geymslu og innskráningarhnapp.
- Eftir innskráningu eru pending public staðir sendir einn í einu með `mergeOnly: true`.
- Fyrirliggjandi server-staður með sama place-key er látinn ósnertur.
- Nýr staður er aðeins settur inn ef pláss er innan 50 staða hámarks; annars helst hann í session-geymslu.
- Venjulegt innskráð autosave-flæði er óbreytt.
- Vegakerfi og vegfærð eru virk á Aksturskortinu og falin á Spákortinu.
- Public road-segment lestur er heimilaður þegar weather-mode er `all`; feature-gate gildir áfram annars.
- Neðri rofar, litaskýring og stöðva-/vegkaflatalningar voru fjarlægð.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/road-intelligence/road-segments/route.ts`
- `lib/__tests__/weather-saved-places-api.test.ts`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar í þessum áfanga

- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/api/teskeid/road-intelligence/road-segments/route.ts`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

Worktree inniheldur einnig eldri, samþykktar breytingar úr fyrri áföngum og ótengda `.obsidian/workspace.json` breytingu. Þeim var ekki snúið við.

## Skipanir og niðurstöður

- `npm.cmd run type-check` — exit 0
- `npm.cmd run test:run -- lib/__tests__/weather-saved-places-api.test.ts` — exit 0, 26/26 próf
- `git diff --check` — exit 0; aðeins line-ending viðvaranir frá Git
- `git diff --stat` og `git status --short` — read-only yfirlit

Enginn dev server var ræstur eða stöðvaður. Ekkert commit, push, deploy, SQL eða migration var gert.

## Ákvarðanir og áhætta

- `sessionStorage` er valið sem sweet spot: lifir reload og innri navigation í sama flipa, en er ekki varanleg vistun milli browser-sessiona.
- Sameiningin er viljandi additive. Hún uppfærir hvorki nafn, notkunartalningu né `last_used_at` á núverandi server-stað.
- Ef notandi er þegar með 50 staði er engu eytt til að rýma fyrir public stað. Pending eintakið helst í sessioni.
- Road-segment endpoint er nú opinber eingöngu þegar allt Veðrið er public. Þetta eykur upstream-umferð frá public notendum en opnar engin Supabase-notendagögn.
- Sérpróf fyrir nýja `mergeOnly` grein og public road-segment feature-mode voru ekki skrifuð í þessum hraða áfanga. Fyrirliggjandi API suite og TypeScript-check eru græn; þetta er helsta prófunargatið.

## Route intelligence check

- Breytingin snertir aðeins birtingu núverandi Vegagerðar-veglags og vegfærðarkafla á Aksturskortinu.
- Engum canonical segmentum, control points, route-family, provider, cache-lykli eða leiðarútreikningi var breytt.
- Engin nákvæm ferð, heimilisföng eða route-history eru vistuð.
- `IcelandRoadmap.md` var ekki uppfært því engri nýrri leiðaþekkingu var bætt við.

## Localhost checks for Stebbi

Opna:
`/auth-mvp/vedrid/road-map-prototype?context=route&view=information`

1. Óinnskráður: veldu frá- og áfangastað, skiptu milli Akstursgagna og Korts og endurhladdu síðuna. Staðirnir eiga að birtast áfram sem vistaðir staðir í sama flipa.
2. Staðfestu að textinn segi að geymslan sé tímabundin og að innskráningarhnappurinn sé sýnilegur.
3. Skráðu þig inn með notanda sem á þegar vistaða staði. Fyrri staðir mega ekki hverfa eða breytast; nýir public staðir eiga aðeins að bætast við.
4. Veldu nýjan stað eftir innskráningu og staðfestu að venjulegt autosave virki.
5. Á Aksturskorti eiga vegakerfi og vegfærð að sjást án fela/sýna-rofa. Neðri rofar, legend og talningar eiga að vera horfin.
6. Skiptu yfir á Spákort. Vegakerfi og vegfærð mega ekki sjást þar.
7. Athugaðu sérstaklega mobile: ekkert lárétt overflow, login CTA auðsmellanlegur og saved-place listinn lokar/velur rétt.

Ekki prófa production-gögn eða breyta Supabase handvirkt. Engin schema-/RLS-breyting fylgir þessum áfanga.

## Næsta skref fyrir Claude Code

Fyrir útgáfu: rýna diffið með áherslu á additive merge, skrifa sérpróf fyrir `mergeOnly` og public/non-public road-segment aðgang og keyra hefðbundið release test/build ferli. Ekki deploya nema Stebbi gefi sérstakt leyfi.

## Óvissa / þarf að staðfesta

Confidence: high í client-session hegðun og að kortalög fylgi contexti; medium-high í end-to-end login promotion þar til Stebbi hefur prófað raunverulegt auth-redirect á localhost.
