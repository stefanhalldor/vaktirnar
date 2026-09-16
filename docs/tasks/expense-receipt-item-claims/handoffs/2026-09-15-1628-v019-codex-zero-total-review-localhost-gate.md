# Núllkrónulínur varðveittar í sér yfirferð: localhost gate

Created: 2026-09-15 16:28
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
GoLive issue: `516ec885-9521-4d84-8350-9219ac829695`
Project: Vaktirnar, `1bb6e3fa-ab25-48c0-a806-342465ee5ded`
Writer: Codex
Base: `57a57d33c093a89ef38dd087acfa2b789897435d`
Worktree: `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2`

## Findings og niðurstaða

Engin blocking findings í lokarýni þessa afmarkaða áfanga. Kóðaleiðréttingar,
67/67 tengd próf, type-check og build eru GREEN. Næsta stopp er raunveruleg
localhost-ræsing Stebba og notendapróf. Engin ný localhost-ræsing eða port hefur
verið staðfest eftir restart; Codex ræsti engan server og keyrði ekkert SQL.

NEI — EKKI KEYRA SQL NÚNA. SQL180 var staðfest EXACT_INSTALLED með
targets_exact=true og postconditions_ok=true samkvæmt v018. Apply/postflight
hashar voru endurstaðfestir óbreyttir, en ekkert nýtt Production runtime-próf
var keyrt. Engin commit, push eða deploy heimild er til staðar.

## Rétt product-samhengi

Öll 18 fyrri handoff og canonical verkefnalýsing voru lesin við endurheimt
samhengis. v014 lagði til að sleppa núllkrónulínum; það er ekki endanlega
samþykkta lausnin. v015–v018 og leiðrétting Stebba staðfesta sér yfirferð þar
sem núllkrónulínur varðveitast og eigandi getur fyllt inn fjárhæðir.

Lína með núllkrónufjárhæð heldur heiti og magni og hefur engin fjárhagsáhrif.
Eigandi velur hana og skráir jákvæða fjárhæð; eftir vistun tekur hún þátt í
venjulegri úthlutun. Að halda núllkrónulínu utan úthlutunar á meðan fjárhæðin
er núll má aldrei túlka sem að eyða henni eða sleppa henni við import.

## Val, heimild og skráning

Stebbi valdi þetta verkefni sérstaklega og samþykkti afmörkuðu kóðavinnuna,
prófanir og framhald að næsta workflow-stoppi. Live GoLive get skilaði HTTP
200, in_progress/medium, exact issue/project og tómum predecessor/parallel
tengingum. Weather candidate bíður áfram eigin browser/release gate.
GoLive policy kemur ekki úr þessum API-samningi; Documents/WORKFLOW.md er
öruggt fallback. Eldra WORKFLOW.md í candidate veitir enga nýja heimild.

Repo-skjal var uppfært; GoLive var aðeins lesið með Codex repository actor.
Venjuleg aðgangsskráning kann að fylgja lestri, en vistun audit-tíma var ekki
staðfest. GoLive-lýsingin vísar enn í v012; ekki nota það sem nýjasta tæknilega
handoff. Engum ownership-, status- eða dependency-reitum var breytt.

## Hvað breyttist

1. `lib/expenses/receipt-split.ts`: reference allocation samþykkir varðveittar
   zero-total item-línur, sleppir aðeins úthlutunarútreikningi þeirra meðan
   fjárhæð er núll og krefst að claims vísi á positive item. Neikvæð item og
   claims á adjustments/óþekkta liði eru áfram eða nú skýrt höfnuð.
   Largest-remainder reiknirit er óbreytt. Helperinn er notaður í prófum;
   raunverulegi fjárhagsfinalizerinn er áfram SQL180.
2. `components/expenses/ExpenseReceiptSplitPanel.tsx`: einn fjárhæðarreitur
   í sér yfirferð notar inputMode="decimal" í stað numeric.
3. `lib/__tests__/expense-receipt-split.test.ts`: mixed positive/zero/adjustment
   regression, varðveisla input-lína, höfnun ógildra claims, negative og
   total mismatch, og úthlutun eftir að 450 minor units hafa verið skráð.
4. `components/expenses/__tests__/expense-receipt-split-panel.test.tsx`:
   staðfestir decimal hint, höfnun tóms/0/neikvæðs/þriggja aukastafa inputs
   og að 4,50 vistist sem 450 minor units.
5. Canonical task-skjal: rétt samhengi, núverandi gate og localhost-kafli;
   úrelt SQL180 preflight-beiðni fjarlægð.
6. Þetta immutable v019 handoff.

Engar SQL-, message-, dependency-, auth-, RLS-, grant-, provider- eða
environment-breytingar. Byggingin notaði fyrirliggjandi .env.local án þess að
Codex læsi eða birti gildi. Generated .next og tsconfig.tsbuildinfo eru local
validation output, ekki product-breytingar. Aðalvinnumöppu var ekki breytt.

## Skipanir, niðurstöður og frávik

- GoLive get með exact project/issue: exit 0, HTTP 200.
- Fyrsta focused keyrsla: 3 skrár, 30/30 PASS, exit 0. Eitt SQL180 filter var
  rangt stafað og valdi enga skrá; rétt filename var fundið áður en lokakeyrsla fór fram.
- `npm.cmd run test:run -- expense-receipt expense-sql180-zero-total-review expense-sql179-receipt-item-claims expense-sql179-target-relation`:
  8 skrár, 67/67 PASS, exit 0. Endurtekið eftir síðustu test-breytingu, sama PASS.
- `npm.cmd run type-check`: exit 0, einnig eftir loka-test-breytingu.
- `npm.cmd run build`: exit 0, 151 static pages generated. Aðeins fyrirliggjandi
  lint/Browserslist warnings. Þetta er local Production build, ekki deployment.
- `git -c core.safecrlf=false diff --check`: exit 0. Fyrri venjuleg keyrsla
  gaf mikið af LF/CRLF warnings; engri Git stillingu var varanlega breytt.
- `git -c core.safecrlf=false diff --exit-code -- package.json package-lock.json vercel.json`:
  exit 0, þessar skrár óbreyttar gagnvart base.
- Read-only source trace: allocation caller, review UI/schema, SQL180 review,
  claim og confirmation samningar, Design.md og shared input-stíll yfirfarin.
- Fyrsta documentation patch hafnað vegna rangs context; engin partial
  breyting. Leiðrétt patch samþykkt.

Full app/expense suite var ekki endurkeyrt: fjögurra skráa afmarkaður diff,
67 tengd próf, type-check og build nægja þessum áfanga. Eldri 1.378 expense og
7.862 full-suite PASS eru saga úr v013, ekki ný sönnun. Eldri booking-fixture
og ignored road-artifact prófunargöt eru ekki endurmetin hér.

## Lokarýni og Design

Codex lauk eigin samfelldri lokarýni; enginn annar agent var kallaður til.
SQL180 varðveitir exact item-set við review og uppfærir fjárhæð sömu línu.
Claim/view/confirmation takmarka úthlutun við positive item. App-schema
samþykkir zero items en hafnar negative. Reference helper er nú í samræmi.
Þetta sannar static samræmi; authenticated runtime bíður localhost-prófs.

Design.md fylgt: endurnýtt expenseInputClass með text-base/min-h-11, engin
layout-breyting eða ný hardcoded copy. Decimal hint styður farsímainnslátt.
Raunverulegt iOS keyboard/focus/zoom þarf tækipróf. Engar route intelligence
breytingar; IcelandRoadmap.md á ekki við þetta receipt-scope.

## Localhost checks for Stebbi

### Næsta aðgerð: ræsa rétt worktree

Stebbi keyrir sjálfur:

```powershell
cd C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2
npm.cmd run dev -- -p 3004
```

Staðfestu síðan möppu og port. Ekki senda .env.local eða lykla. Codex hefur
ekki prófað opið port eða tekið yfir server; ný staðfesting þarf eftir restart.
Eftir staðfestingu má Codex framkvæma tiltækar öruggar browser/API athuganir
innan þessa gates. Nauðsynleg innskráning og raunverulegt farsímalyklaborð
eru hjá Stebba.

### Afmarkað yfirferðarpróf

1. Opna `http://localhost:3004/auth-mvp/splitta-reikningnum` sem innskráður
   eigandi með existing Expense entitlement og receipt flag. Opna eigin
   ódeild synthetic kvittunardrög með einni jákvæðri línu og núllkrónulínu.
   Ef ný drög þarf, nota manual AI-import leið og synthetic mynd/gögn;
   ekkert innbyggt provider-kall þarf til þessa prófs.
2. Staðfesta að núllkrónulínan sjáist í sér yfirferð með réttu heiti/magni.
   Vista óvalda línu og refresh: línan á áfram að vera til með fjárhæð 0.
3. Velja línuna til að taka með. Tómt gildi, 0 eða neikvætt gildi á að gefa
   villu og ekki vistast sem virk fjárhæð.
4. Í EUR synthetic dæmi slá inn `4,50` og vista. Vænt: 4,50 EUR, ekki 450 EUR;
   jákvæð fjárhæð helst eftir refresh og línan er venjulegur kostnaðarliður.
   Heildarsumma þarf að stemma áður en lokaúthlutun getur síðar verið staðfest.
   Dæmi: 10 EUR annar liður + 4,50 EUR leiðréttur liður = 14,50 EUR synthetic
   heild. Ekki breyta heild á raunverulegri kvittun til að fela mismatch.
5. Við 360/390/460px og á síma: fjárhæðarreitur leyfi tugabrot, engin óvænt
   þysjun, lárétt overflow eða rangur scroll eftir opnun/lokun lyklaborðs.
6. Stoppa eftir vistun/refresh og senda stutta niðurstöðu eða notendasýnilega
   villu. Ekki deila, endanlega staðfesta kostnað, eyða mynd/drögum eða keyra SQL.

Localhost notar fyrirliggjandi tengingu við Production Supabase; vistun draga
er raunveruleg gagnabreyting þótt prófsgögn séu synthetic. Prófa aðeins eigin
prófsgögn. Lokaúthlutun, raunverulegir þátttakendur og eyðing eru utan þessa
gates. Ekki senda private mynd, JSON, UUID, signed URL eða secrets í evidence.

## SHA-256

- receipt-split.ts: `92bd610b56f0e3bdcebda3bb8ede4003ebd50c6270ef3b4bb4c1607c353dd6f2`
- ExpenseReceiptSplitPanel.tsx: `67d5eec08598d0964980239e795403b809a7616ec991420bba6c50c2d6502ae2`
- expense-receipt-split.test.ts: `cdad5544e1cafbeb250ad5a4fd7c89d121a8332a1c2e20d365bdaad3ed406da6`
- expense-receipt-split-panel.test.tsx: `ce04901269370ca022bca9b4ad5017ea554ff8338aea243a15170cf7d9d55bbe`
- SQL179 apply, óbreytt: `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`
- SQL180 apply, óbreytt: `681d415f667a866099244415ce088906a1e89f69813d36d5c9dee5549d505a47`
- SQL180 postflight, óbreytt: `afedbb8f7d0fe557201889542af64d16223f27ab40ee5bec852e33be13ef0d5a`

## Óvissa / þarf að staðfesta

Confidence high um afmarkaða kóðaleiðréttingu og static samræmi. Localhost
runtime, innskráning, raunverulegt keyboard og release eru óstaðfest.
Þegar prófið er GREEN heldur Codex áfram innan fyrirliggjandi undirbúnings-
umboðs; commit/push/deploy verður sérstök eigendagátt.
