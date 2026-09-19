# MVP samnings- og hönnunarplan: staðarsíða, Pöntun og Splitt

Created: 2026-09-19 06:52
Timezone: Atlantic/Reykjavik

## Findings og verkefnaval

Verkefni: restaurant-digital-menu-to-split, áframhald samkvæmt skýru samtalssamhengi
Stebba. GoLive projects/get HTTP 200 staðfestu sama MVP-miða hjá Vaktirnar/Gott vibe
og issues:read/issues:write. Ekkert nýtt task valið. Ownership/dependency/policy
projection vantar í get; það er UNKNOWN en hindrar ekki sjálfstætt plan.

**P1: Operational projection er ekki guest-order geymsla.**
SQL192:609-636 og 664-699 lesa restaurant_split_items eftir venue, líka línur án
borðsetu. Að endurnýta þá töflu fyrir óafhenta MVP-pöntun myndi gera hana sýnilega
staðnum. Ekki skrifa MVP-val í hana eða restaurant_preorder_visits sem forecast les.
Þetta er staðfest source-hegðun, ekki fullyrðing um lifandi notendagögn.

**P2: Splitt-íhluturinn er enn bundinn kvittunarflæði.**
SplitBoardV2.tsx notar receipt-import, review, share og delete controls ásamt
sameiginlegum claims. splitUser/guardSplit í lib/receipt-split/server.ts:11-20
krefjast EXPENSE_RECEIPT_AI_ENABLED. Restaurant-adapter þarf skýran capability-
samning, ekki að virkja AI eða fela óheimilar aðgerðir eingöngu client-megin.

**P2: Markgildi eru ósamræmd.**
Matseðill getur haft 500 rétti, en SplitViewV2 og participant-add mest 100 línur.
Þetta er pöntunarlínuhámark, ekki ástæða til að stytta allan matseðil í 100.
View-v2 hafnar claims á núllverðslínum en núverandi restaurant submit biður um full
initialClaimUnits. Ný adapter-regla þarf að varðveita þessa invariant við ókeypis rétt.

Confidence: hátt um þessi source-bil; gagnagrunns/runtime-hegðun er ekki prófuð.
V002 privacy/currency/retry findings halda gildi og eru release-forsendur.

[GoLive verkefnið](https://goliveplaybook.com/roadmap?project=1bb6e3fa-ab25-48c0-a806-342465ee5ded&task=f08f2e57-45c3-43a7-8de2-a28238235807)

## Tillaga að pöntunarsamningi

Þetta eru rökstuddar implementation-tillögur, ekki nýjar samþykktar
product-ákvarðanir eða skrifað SQL. Canonical MVP-scope er óbreytt.

1. Opinber skoðun og tímabundið einkaval þurfa ekki pöntunarstofnun eða innskráningu.
   Við fyrstu staðfestingu eða boð-aðgerð er login með öruggri endurkomu og síðan
   stofnuð ein Pöntun. Notandi getur lokið ein(n), engin lágmarkskrafa um boð.
2. Þunn order-context eining geymir venue/menu/currency, stofnanda, revision,
   tegund og UNIQUE tengingu við eitt venjulegt Splitt. Aðeins Splitt heldur
   staðfestar fjárhæðir og claims. Engin tvöföld order-total/settlement bókhaldssaga.
3. Stofna order-context, tómt Splitt og active creator í einni actor-bound transaction
   með request-id. Pöntun er framsetningin; tómt Splitt er innri tenging, ekki
   krafa á notanda. Ný afmörkuð RPC framhjá kvittunar-extraction, engin gervilína.
4. Einkadrög geymast actor/order/menu-version scoped. Guest-drög verða ekki eign
   næsta innskráða notanda í hljóði: explicit adoption eftir login og ný validation.
   Óstaðfest drög breyta ekki sameiginlegri tegund eða sýn annarra.
5. Að staðfesta eigið val sendir bounded batch af línum, menu-version, væntu verði,
   currency og order revision. Server reiknar verð og magn; client er ekki authority.
   Allar línur batch, tegundarbreyting, provenance og eigin claims verða atomic.
   Óviss niðurstaða er lesin/replayed með sama immutable request/payload.
6. Staðfestir liðir verða strax venjulegar Split-línur með order-line/source mapping
   sem staff/forecast les ekki. Einkadrög eru aldrei birt í Splitt. Engin seinni
   client-side afritun eða endurstilling claims þegar Splitt-íhlutur opnast.
7. Pöntun sýnir hóp, val hvers og sameiginlegt yfirlit. Við staðfestingu birtist
   uppfærð Splitt-samantekt sjálfkrafa; „Sjá skiptingu“ opnar sömu sameiginlegu
   eininguna. Enginn þarf að smella á tæknilegt „flytja/stofna Splitt“ skref.
8. Eigin staðfest lína er ekki breytt hjá öðrum. Ný viðbót er ný intent; leiðrétting
   eða niðurfelling notar revision og existing claim-öryggi. Ekki overwrite-a
   línu sem aðrir hafa tekið hlut af. Bæta þarf sér contracti við vegna SQL192
   edit-banns á restaurant_menu; ekki veikja almennt participant-edit.
9. Fyrir 0-verð er provenance varðveitt en engin positive claim stofnuð samkvæmt
   SplitView invariant. Hámark 100 lifandi pöntunarlína skilar sýnilegri villu,
   engri truncation eða partial batch. Magn og safe-integer mörk server-staðfest.

### Tegund, síun og concurrency

Tillaga fyrir ósvaraðar stillingar: tegund er óvalin í byrjun, stofnandi velur
sameiginlega tegund og Út að borða helst þar til hann velur annað. Fyrir lokaval
þarf að velja tegund ef enginn non-take-away réttur hefur þegar ákvarðað hana.
Valfrjáls sía er einkastilling gests og aldrei mutation á sameiginlegri pöntun.

Non-take-away réttur í staðfestu vali breytir order.mode í Út að borða í sömu
transaction og línurnar. Við einkaval birtist strax skýring á væntri breytingu;
aðrir sjá hana þegar val er staðfest. Server hafnar manual Take-away ef slíkar
línur eru til. Bounded læsingar með einni staðfestri lock-röð fyrir order/split
og retries forða mismunandi niðurstöðu hjá tveimur samtímis þátttakendum.
Stale revision skilar fersku samanteknu contexti og endurstaðfestingu, ekki
blindri yfirskrift eða automatic retry á breyttu verði.

Menu-version/currency/eligibility eru immutable snapshot á samþykktu vali.
Endurbirtur matseðill endurreiknar ekki gamalt val í hljóði; nýtt eða leiðrétt
val þarf að samþykkja gildandi skilmála. Currency-misræmi hafnað án gengisbreytingar.
Take-away getur ekki orðið fullstaðfest á úreltu hæfi án nýrrar athugunar.

### Boð og heimildir

Endurnýta TeskeidPersonPicker fyrir val og login-return mynstur úr SplitJoin.
Destination-adapter leysir identity server-megin og stofnar pending boð fyrir
exact order. Samþykki stofnar/virkjar nákvæmlega eitt membership í tengdu Splitti
með transaction/idempotency; ekki annað ósamstillt roster sem veitir aðgang.
Name-only picker-val er ekki authenticated identity og má ekki veita aðgang.
Við email-val birtast ekki netföng í sameiginlegu order view eða logs.

Pending preview fær aðeins lágmarks boðaupplýsingar. Membership endurmetið við
hverja read/mutation, líka replay. Revoked/pending/unrelated fá ekki gamla result
með einkagögnum vegna þess eins að request-id hafi verið notað áður.
Bjóða fleiri tekur samþykkta pöntunarheimild, aldrei source-roster réttindi.
In-app boð eru tillaga; ekki skipta þeim hljóðlega út fyrir almennan share-token.
Engin sjálfvirk email sending í MVP-planinu.

## Hönnunarplan: veitingastaðasíðan

Halda núverandi `/matseðill/[venueSlug]` sem inngangi í fyrsta pakka. Ekki stofna
nýja opinbera route-fjölskyldu án þörf. Innskráð owner/order route-nöfn eru tillögur
sem þarf að samræma routing/middleware áður en kóði er skrifaður.

Röð í síma, frá toppi niður:

| Svæði | Efni og hegðun |
| --- | --- |
| Lágvær header | Teskeið/back; skýrt pending við navigation |
| Staðurinn | Nafn, stutt lýsing og ein raunmynd ef hún er til; fallegt án myndar líka |
| Matseðill | Fyrirsögn, flokkar ef samþykktir og læsileg lýsing; enginn risastór hero |
| Síun | „Aðeins take-away“ af/á; teljari/empty state, ekki tegundarskipun |
| Réttir | Nafn, stutt lýsing, verð, framboð og take-away merki; ein Bæta við aðgerð |
| Eigið val | Magn, fjarlægja, eigin samtala og áhrif á tegund áður en staðfest |
| Pöntunin | Tengill að hópi, Bjóða öðrum og núverandi tegund; engin staff-staða |
| Samantekt | Samþykkt val og Splitt-samantekt; ekki „sent í eldhús“ eða „tilbúið“ |

Desktop heldur sömu röð/merkingu með matseðli og afmarkaðri hliðarsamantekt;
mobile notar sheet eða in-flow eigið val. Sticky footer má aðeins nota með safe-area
og keyboard/focus prófi; hann má ekki hylja neðsta rétt. Leita ekki í öllu appinu
fyrir þetta MVP og ekki bæta við checkout/greiðsluskrefi.

Lágupplausnar vírrammi (framsetningartillaga, ekki mynd af tilbúnum skjá):

    ‹ Teskeið                        [Mitt val · 2]
    [           mynd staðar ef til           ]
    Nafn veitingastaðar
    Stutt lýsing staðarins

    Matseðill           [ ] Aðeins take-away
    Heiti réttar                     2.400 kr.
    Lýsing · Take-away                 [ + ]
    ────────────────────────────────────────
    Heiti réttar                     3.200 kr.
    Lýsing · Aðeins á staðnum          [ + ]

    Mitt val · 2 réttir               5.600 kr.
    [                 Skoða val             ]

Eigin val/opin Pöntun:

    Pöntun · Nafn staðar
    Tegund: Út að borða / Take-away / Óvalið
    [Bjóða öðrum]   Þú · Anna · Jón
    Mitt val       Sameiginlegt val
    [réttir og magn]
    [Staðfesta mitt val]
    „Pöntunin verður Út að borða vegna ...“
    Splitt · Mitt samtals / hópur samtals
    [Sjá skiptingu]

Owner fer í: eigin rekstur → staður → upplýsingar → matseðill → preview → birta.
Per-rétt editor sýnir verð/framboð og sérstakt take-away toggle. Birting staðfestir
revision og skilar nýrri menu-version. Óviss birting fær readback, ekki nýja stofnun.
Myndaval/upload og flokkar eru hönnunartillögur sem þarf að afmarka með asset-/schema
samningi; engin mynd er sótt eða framleidd og engin geymsluþjónusta uppsett núna.

Design.md: semantic tokens, léttar línur, engin nested card-uppbygging, minnst 16px
inputs og 40px targets, canonical TeskeidLoader/loading.tsx og pending. Endurnýta
people-picker composition. SplitBoardV2 þarf þunnan adapter eða afmarkað extract
á sameiginlegum summary/claim hluta; ekki afrita fjárhagsreikning eða receipt controls.
Allur endanlegur product-texti í is/en; ofangreind copy er aðeins plan-tillaga.

## Fyrsti yfirferðarhæfi framkvæmdarpakki

**A: Veitingastaður, matseðill og take-away merking.** Sýnilegt gildi kemur fyrst.

- Isolated candidate af ferskum remote-grunni; varðveita dirty root.
- Staðfesta núverandi owner/space/profile authority og nota aðeins existing rekstur.
- Nýr schema/contract pakki fyrir per-rétt take-away og samþykkta staðarframsetningu.
  SQL192 sýnir engan take-away dálk; UI-only flag eða localStorage er ekki viðunandi.
  Default á gömul item þarf örugga óstaðfesta/false merkingu, ekki giska á take-away.
- Versioned public resolver/strict schema svo gamall consumer brotni ekki við nýjan
  reit. Velja einn birtan matseðil skýrt; núverandi SQL resolver getur fengið fleiri
  en einn menu-hóp fyrir venue. Ekki velja óákveðna röð.
- Scoped owner-reader og editor með fullu permission/revision checki. Public preview
  má ekki birta óbirt draft eða owner/private gögn.
- Opinber staðarsíða samkvæmt wireframe og sample fixtures merkt sem slíkar.
- Pöntunar-/boð-/Splitt-mutations eru næsti pakki B, ekki hluti A. A má ekki sýna
  virka blekkjandi submit-aðgerð áður en B er til; merkið skýrt hvað prófun nær yfir.
- SQL artifacts með preflight/migration/postflight í nýrri númeraröð aðeins eftir
  afmarkaða framkvæmdarbeiðni. Codex keyrir ekkert SQL; Stebbi keyrir pakkann.

Scope A: lib/restaurants, components/restaurants, app/matseðill, scoped owner routes,
messages/is.json + en.json, viðeigandi tests og nýr SQL-pakki eftir samþykki.
Ekki endurskrifa shared business identity eða útvíkka advertiser réttindi.

## Prófunarplan og hætta

A: role/space/profile matrix, archived/disabled venue, draft/public projection,
false/true/unknown take-away, multiple menus, version conflict, retry publish,
strict old/new payload og mobile/keyboard. Focused tests, typecheck, scoped lint;
build og localhost fyrir release. Enginn full-suite hringur fyrir hreint plan.

B: zero-price, 100/101 línur, mismunandi currency, same-request replay, payload drift,
revoked replay, tvö simultaneous submit, price/availability/eligibility refresh,
atomic rollback, guest→login adoption, account/order switch og claims annarra.
Staðfesta sérstaklega að staff/forecast sjái ekkert MVP-val; árangurspróf á
Split summary og exact total preservation. SQL runtime-evidence kemur frá Stebba.

## Verification og umboð

Source skoðað á 0b5695d; enginn remote-fetch, lifandi SQL-lestur eða runtime-próf.
Lesið: canonical scope/v003, Design.md mobile/components/navigation, SQL192 schema,
owner assertion/operations/forecast/public resolver, restaurant contracts/management,
SplitBoardV2/server/view-v2 og TeskeidPersonPicker. Fyrri v002 findings notuð með skýrum uppruna.
GoLive projects/get exit 0 HTTP 200. Nákvæma npx skipunin skilaði exit 1 vegna
PowerShell policy; npx.cmd með escalation notaði sama client. Engin mutation.

Breytt: canonical verkefnisskjal og þetta nýja v004 handoff/plan. Eldri handoff og
AGENTS.md/WORKFLOW.md breytingar ósnertar. Enginn runtime-kóði, migration, SQL, env,
server, push eða deploy. Skjala- og scope-checks fara fram fyrir local docs commit.
Parent fyrir þessa lotu: 0b5695d698b4cf03b0869a3ca411287fa76d0970.
Næst er gagnrýnin rýni plans og síðan afmarkað framkvæmdarumboð fyrir pakka A;
tillögur B eru ekki samþykktar eigandaákvarðanir. GoLive næsta skref er enn samnings-/hönnunarvinna;
það var lesið en ekki uppfært í þessari lotu.

Skjalaathugun á canonical/v004: skyldukafli, whitespace/conflict markers og
afmarkað secret-pattern scan PASS. git diff --check exit 0, aðeins CRLF warnings.
Runtime-próf voru ekki keyrð fyrir hreint Markdown-plan. Local commit er staðfest
með expected parent, staged tree og tveggja skráa scope; identity birtist í chatsvari.

## Handoff til Claude Code

```text
Claude Code: Rýndu þetta v004 plan gegn canonical docs/tasks/restaurant-digital-menu-to-split/restaurant-digital-menu-to-split.md og gildandi WORKFLOW/Design.md. Þetta er plan-rýni, ekki runtime- eða SQL-framkvæmdarumboð. Metið sérstaklega minnstu leið fyrir pakka A: owner/staðarsíðu/matseðil/take-away gögn. Staðfestið að pakki B geti endurnýtt Splitt án staff/forecast leka, kvittunar-AI skyldu eða tvöfalds fjárhagsgrunns. Rýnið atomic batch/retry, claims á ókeypis liðum, 100-línu mörk, login/boð/membership og private drafts. Aðgreinið tillögur um tegundarstjórnun frá samþykktum reglum Stebba; ekkert ósvarað atriði er sjálfkrafa samþykkt. Ekki framkvæma SQL, push/deploy eða skilaboðasendingar. Skilið findings fyrst og task-owned handoff með Localhost checks for Stebbi.
```

## Localhost checks for Stebbi

LOCALHOST_NOT_APPLICABLE núna: þetta er Markdown-plan/vírrammi, enginn nýr skjár.

Fyrir A þarf exact candidate/revision, env-preflight og staðfest port/ræsingu
Stebba áður en browser-próf hefst. Prófa samþykktan owner og annan owner, birtan og
óbirtan matseðil, rétt sem er take-away og rétt sem er ekki. Owner preview og logged-out
`/matseðill/<venueSlug>` verða að birta rétt gögn. Sía af/á á að breyta réttalista,
ekki gögnunum sjálfum. Edit/publish/refresh varðveitir hæfi, verð og revision.
Óviðkomandi eða breytt profile-id hafnast. 360/390/460px, keyboard, back, pending.
Ekki prófa ósamþykkt skrif á raunstað; localhost getur notað production-Supabase.

Fyrir B fylgir canonical heildarprófið með tveimur vinum, exact order boði og
sjálfvirkri tegundarbreytingu/Splitt-tengingu, án borðsetu. Engin boðasending,
SQL eða raunnotendagagnabreyting er heimiluð með þessu plani einu.
