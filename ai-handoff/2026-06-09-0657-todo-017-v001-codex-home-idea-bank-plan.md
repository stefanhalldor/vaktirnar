# TODO #17 - Codex handoff plan for ideas from the idea bank on `/heim`

**Dagsetning:** 2026-06-09 06:57
**Agent:** Codex
**Tengt TODO:** #17 Hugmyndir úr hugmyndabankanum á `/heim`
**Hlutverk:** Claude Code er framkvæmdaaðilinn. Codex er að skila plani og áhætturýni.

## Stutt niðurstaða

Claude Code skal skipta disabled `Væntanlegt` röðunum á `/auth-mvp/heim` út fyrir mobile-first framsetningu sem sýnir public hugmyndir úr hugmyndabankanum og leyfir kosningu beint af heimaskjánum.

Codex mælir með einfaldri, static mobile-first framsetningu fyrst, ekki auto-carousel.

Mikilvægast:

- Halda `Lánað og skilað` sem skýrri virkri Teskeið.
- Sækja aðeins `ideas.is_public = true`.
- Endurnýta núverandi vote API og `VoteButton`.
- Ekki búa til sér vote-flow fyrir `/heim`.
- Ekki blanda #12 vote-copy breytingunni inn nema Stebbi samþykki það sérstaklega.

## Það sem Codex skoðaði

Codex skoðaði read-only:

- `TODO.md`
- `app/auth-mvp/heim/page.tsx`
- `components/teskeid/IdeaCard.tsx`
- `components/teskeid/VoteButton.tsx`
- `app/page.tsx` var skoðuð í fyrri lotu og notar public idea query með `.eq('is_public', true)`.

Codex gerði engar kóðabreytingar fyrir #17.

## Núverandi staða

`app/auth-mvp/heim/page.tsx`:

- birtir greeting
- birtir `RecentSection`
- birtir `Teskeiðar` lista
- sýnir `Lánað og skilað` ef `loansEnabled`
- sýnir síðan disabled `UPCOMING_KEYS` röð:
  - `upcomingEmail`
  - `upcomingExpenses`
  - `upcomingPartner`
  - `upcomingWeather`
  - `upcomingKidsShift`
  - `upcomingThirdShift`
  - `upcomingOutToPlay`

TODO #17 vill að þessar disabled raðir víki fyrir raunverulegum public hugmyndum úr hugmyndabankanum.

## Mælt UX umfang

### Halda virkum Teskeiðum sér

`Lánað og skilað` á áfram að vera virkur action-row undir `Teskeiðar`.

Ekki láta hugmyndir líta út eins og virkar Teskeiðar. Þær eiga að vera merktar sem hugmyndir eða eitthvað á borð við:

```txt
Úr hugmyndabankanum
```

### Skipta disabled lista út fyrir hugmyndasection

Mælt:

1. Fjarlægja eða hætta að rendera `UPCOMING_KEYS` disabled buttons.
2. Bæta við nýju section eftir `Teskeiðar`, t.d. `Hugmyndir í Teskeið`.
3. Sýna 3-5 public hugmyndir í mobile-first compact framsetningu.
4. Hvert atriði:
   - title
   - short description eða stutt context
   - link á `/hugmyndir/[slug]`
   - `VoteButton`

Codex mælir með static lista eða láréttri scroll-snap kortaröð. Ekki nota auto-carousel.

## Gagnaáætlun

Í `/auth-mvp/heim/page.tsx`, sækja public ideas með venjulegum Supabase client, ekki service_role:

```ts
const supabase = await createClient()
const { data: ideas, error: ideasError } = await supabase
  .from('ideas')
  .select('id,title,slug,short_description,category,status,votes_count,is_public,is_featured')
  .eq('is_public', true)
  .order('is_featured', { ascending: false })
  .order('votes_count', { ascending: false })
  .limit(5)
```

Ástæða:

- `app/page.tsx` notar nú þegar public hugmyndir sem canonical public source.
- `/heim` þarf ekki admin/service_role aðgang til að sýna public hugmyndir.
- Select-a aðeins þau fields sem UI þarf.

Ef query mistekst:

- logga safe generic server message, ekki error payload
- rendera `/heim` áfram án idea section eða með rólegu fallback
- ekki brjóta loans/home upplifun

## Mæltar skrár

Claude Code mun líklega breyta:

```txt
app/auth-mvp/heim/page.tsx
messages/is.json
messages/en.json
lib/__tests__/home-page.test.tsx
```

Mögulega bæta við:

```txt
components/teskeid/HomeIdeasSection.tsx
```

Ef component verður client vegna `VoteButton`, þá má samt halda gagnasöfnun í server page og senda hreina idea props niður.

## Component plan

Búa til lítið component, t.d. `HomeIdeasSection`.

Mælt props:

```ts
interface HomeIdeasSectionProps {
  ideas: Pick<Idea, 'id' | 'title' | 'slug' | 'short_description' | 'category' | 'status' | 'votes_count'>[]
  labels: {
    heading: string
    eyebrow: string
    empty: string
    details: string
  }
}
```

Mælt rendering:

- Ef `ideas.length === 0`, annað hvort rendera ekkert eða rólegt fallback.
- Fyrir hverja hugmynd:
  - Link wrapper á `/hugmyndir/${idea.slug}`
  - Title og short_description
  - Lítill texti sem segir að þetta sé hugmynd, ekki virk Teskeið
  - `VoteButton ideaId={idea.id} initialCount={idea.votes_count}`

Passa að VoteButton sé ekki inni í Link. Card má hafa sér Link area og sér vote area eins og `IdeaCard` gerir.

## Vote behavior

Endurnýta `components/teskeid/VoteButton.tsx`.

Ekki:

- kalla `/api/votes` öðruvísi frá `/heim`
- búa til nýja vote endpoint
- geyma vote state í profile eða auth user
- breyta tvöfaldra-atkvæða-vörn

Athugið að `VoteButton` er með hardcoded íslenska texta og #12 vill skýrari copy. Ekki laga það inni í #17 nema Stebbi ákveði að sameina #12 og #17. Ef sameinað er, þarf sér rýni því þá snertir verkið bæði home UX og vote component i18n.

## Messages

Bæta við texta í `messages/is.json` og `messages/en.json`, líklega undir `teskeid.home`.

Tillaga íslenska:

```json
"ideasTitle": "Hugmyndir í Teskeið",
"ideasEyebrow": "Úr hugmyndabankanum",
"ideasDetails": "Sjá hugmynd",
"ideasEmpty": "Engar birtar hugmyndir fundust í bili."
```

Enska:

```json
"ideasTitle": "Ideas for Teskeið",
"ideasEyebrow": "From the idea bank",
"ideasDetails": "View idea",
"ideasEmpty": "No published ideas are available right now."
```

Ef textar verða sýnilegir í `VoteButton`, þá færa þá í `teskeid.vote` eða sambærilegt namespace í sér #12 breytingu.

## Tests

Lágmarks tests í `lib/__tests__/home-page.test.tsx` eða nýju dedicated test:

1. `/heim` heldur áfram að sýna `Lánað og skilað` þegar `loansEnabled` er true.
2. Disabled `Væntanlegt` rows birtast ekki eftir #17 breytingu.
3. Public ideas birtast með title og link á `/hugmyndir/[slug]`.
4. VoteButton eða vote action birtist fyrir hverja hugmynd.
5. Ef public idea query skilar tómu arrayi brýtur `/heim` ekki.
6. Ef idea query skilar error brýtur `/heim` ekki og lánaupplifun helst sýnileg.
7. Query/request mock tryggir að aðeins `is_public = true` sé notað ef test setup leyfir.

Manual test þarf sérstaklega mobile 360-460 px.

## Prófanir sem Claude Code skal keyra

```powershell
npm run type-check
npm run test:run
```

Þar sem þetta snertir Next server page:

```powershell
npm run build
```

Ekki ræsa dev server; Stebbi sér um localhost.

## Handpróf fyrir Stebba

Á `/auth-mvp/heim`:

1. `Lánað og skilað` er áfram skýr virk Teskeið.
2. Gamli disabled `Væntanlegt` listinn er horfinn.
3. Public hugmyndir birtast í rólegri mobile-first framsetningu.
4. Smellur á hugmynd fer á `/hugmyndir/[slug]`.
5. Kosning virkar beint af `/heim`.
6. Atkvæðafjöldi og valið/óvalið state hegða sér eins og á canonical hugmyndasíðu.
7. Við 360-460 px skarast ekki texti, VoteButton eða cards.

## Áhætta

- Gagnaleki: ekki nota service_role, ekki sýna drafts/falin/admin gögn.
- UX ruglingur: hugmyndir mega ekki líta út eins og virkar Teskeiðar.
- Vote duplication: ekki búa til sér vote logic.
- Performance: mörg `VoteButton` geta hvert sync-að `/api/votes`; halda fjölda hugmynda hóflegum fyrst.
- Scope creep: ekki leysa #12, #22 eða #8 í þessu verki nema Stebbi biðji sérstaklega um það.

## Ekki gera í þessu verki

- Ekki hreinsa `/auth-mvp/` slóðir. Það er #22.
- Ekki setja loader. Það er #8.
- Ekki endurhanna alla `/heim` síðuna.
- Ekki búa til nýtt carousel library.
- Ekki breyta voting API.
- Ekki snerta SQL, RLS, grants eða service_role functions.

## Stoppskilyrði

Claude Code skal stoppa og skila handoff ef:

1. Public ideas eru ekki aðgengilegar með venjulegum Supabase client án service_role.
2. Þarf að breyta RLS eða grants til að sýna hugmyndir.
3. VoteButton reynist ekki endurnýtanlegur án stærri refactor.
4. Mobile framsetning fer að krefjast stærri redesign á `/heim`.
5. Tests krefjast umfangsmikilla mock breytinga utan home/idea/vote svæðis.

## Handoff frá Claude Code eftir framkvæmd

Claude Code skal skila:

1. Hvað var gert.
2. Breyttar skrár.
3. Hvernig tryggt er að aðeins public hugmyndir birtist.
4. Hvort `VoteButton` var endurnýtt óbreyttur eða breyttur.
5. Keyrðar skipanir og exit codes.
6. Hvort SQL var skrifað eða keyrt. Vænt svar: nei.
7. Handpróf fyrir Stebba.
8. Opin atriði fyrir Codex rýni.

