# WORKFLOW.md — Vaktirnar / Teskeið

Lesa fyrst [sameiginlegar vinnureglur í Documents/WORKFLOW.md](../WORKFLOW.md).
Þessar reglur eru stutt repository-specific viðbót. Sameiginlega workflowið
gildir fyrst; þessi skrá sérhæfir það og má aðeins bæta við sterkari mörkum.
Raunverulegan árekstur skal bera upp við Stebba, aldrei leysa með permissive
ágiskun.

## Teskeið product- og UI-principles

Teskeið á að byggjast upp úr endurnýtanlegum, skýrum kjarnahlutum frekar en
einnota lausnum sem líta út fyrir að vera fljótlegar í augnablikinu.

Þegar nýtt feature, skjár, kortalag, chat/púls, provider eða UI-mynstur er
planað eða útfært skal meta sérstaklega:

- hvaða components, hooks, helpers, types, API contracts og domain-lógík má
  endurnýta;
- hvort extract-a eigi reusable kjarna áður en hegðun er endurtekin;
- hvort lausnin nýtist næsta provider/skjá/product-samhengi eða festir repo-ið
  í feature-specific sérlausn;
- hvort flýtileið skerði upplifun, samræmi eða áframhaldandi þróun;
- hvort einfaldari eða ódýrari leið heldur upplifuninni jafn góðri.

Sameiginleg samskipti skulu byggð sem canonical domain-neutral primitive með
þunnum feature-adapter. Primitive á framsetningu, focus, keyboard, loading,
empty/error og mobile-hegðun; adapter leggur til feature-copy, örugg gögn,
capability og mutation.

Endurnýtt val á aðila jafngildir aldrei aðgangi. Destination-feature ákveður
sjálft heimildir og mutation sem veitir aðgang er alltaf server-authoritative.
Aðgangur að source- eða parent-feature veitir ekki sjálfkrafa aðgang að öðru
embedded/destination-feature.

## IcelandRoadmap / leiðartengd vinna

Allt sem snertir leiðir, vegkafla, route options, curated leiðir, provider
station matching, route-cache, interest heatmap, ferðaveðurkort eða
vegkaflaviðvaranir í Veðrinu á Teskeið fer í gegnum `IcelandRoadmap.md`.

Markmiðið er reusable Íslandsleiðagrunnur þó Google Routes eða aðrir providers
séu notaðir sem provider, fallback eða samanburður. Ekki dreifa
provider-specific sérlausnum þegar þekking á heima í sameiginlegum leiða-,
vegkafla- eða control-point grunni.

Við leiðartengt handoff/review/implementation skal gera `Route intelligence
check`:

- hvaða leið, vegkafla, landshluta eða route-family snertir breytingin;
- hvort ný þekking eigi heima í `IcelandRoadmap.md` eða
  `lib/iceland-routes/`;
- hvort lausnin sé provider-neutral þar sem eðlilegt er;
- hvort uppfæra þurfi canonical segment, control point, route caution,
  station-matching reglu, cache-lykil eða test fixture;
- hvort route-gögn séu privacy-safe segment-level aggregates fremur en nákvæm
  heimilisföng eða persónulegar ferðir;
- ef `IcelandRoadmap.md` er ekki uppfært, af hverju ekki.

`lib/iceland-routes/` er landing zone fyrir reusable route-domain kjarna.
Veðrið má vera fyrsti consumer en grunnurinn skal geta nýst víðar.

Ekki skipta routing provider út í Production, keyra migration eða geyma ný
route-gögn í Supabase nema það sé sérstaklega planið og samþykkt af Stebba.

## Local SQL og release

- Ný Vaktirnar SQL artifact nota local `SQL<nr>` auðkenni og skýrt hlutverk á
  fyrstu línu, til dæmis `MIGRATION`, `PREFLIGHT`, `POSTFLIGHT`, `RECOVERY` eða
  `DIAGNOSTIC`.
- Rétt SQL-mappa og númeraröð koma úr active task/repository context; ekki
  giska eða nota convention úr öðru repository.
- Repository-specific deployment target, branch og release checks koma úr
  active task og local configuration. Sameiginleg Vercel- og approval-mörk úr
  root workflowi gilda áfram.

### Ein SQL-pakkaafhending

Þegar handvirk SQL-gátt er tilbúin skal Stebbi fá allan yfirfarna pakkann í
sömu afhendingu: preflight, migration og postflight. Fyrir hverja skrá fylgja
beinn local file-linkur, hlutverk, SHA-256, byte-stærð og nákvæm vænt niðurstaða.
Afhendingin skal einnig innihalda beinan, staðfestan hlekk á SQL Editor fyrir
exact Supabase project þar sem skrárnar eiga að keyra.

Fyrir þetta repository er núverandi staðfesta project ref
`bpjwgutpzsifjaucvkbk` og SQL Editor er
`https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new`.
Staðfesta skal target aftur úr öruggri public local configuration áður en hver
ný SQL-afhending er gefin; ekki nota þennan hlekk ef target hefur breyst og ekki
birta lykla eða önnur credentials.

Allar skrár eru afhentar saman svo Stebbi hafi heildarferlið fyrir framan sig,
en þær eru keyrðar hver í sinni nýju SQL Editor query og í nákvæmri röð:
preflight, migration, postflight. Stebbi stoppar strax ef preflight er ekki
exact PASS/READY, ef migration skilar villu eða transaction-staða er óljós, eða
ef postflight er ekki exact PASS. Aldrei keyra seinna skref eftir RED, UNKNOWN
eða villu og aldrei endurkeyra migration blint.

### BASELINE_RED_NONBLOCKING

Ef full suite er RED á clean canonical baseline ber Codex saman exact failing
test IDs, assertion messages, uncaught errors og snapshot drift; fail counts
eða failure families ein og sér nægja ekki.

- Ný failure identity, uncaught error, snapshot drift eða regression sem er
  aðeins í candidate er candidate RED og er lagað og endurprófað innan scope.
- Ef öll candidate failures eru á clean canonical baseline, eða candidate hefur
  færri failures án nýrra failure IDs/errors, er niðurstaðan
  `BASELINE_RED_NONBLOCKING`. Exact command, commit og identity-samanburður er
  skráður og óskyld baseline debt er ekki lagað í feature scope.
- `BASELINE_RED_NONBLOCKING` hindrar ekki einn hreinan local commit þegar
  focused tests, typecheck, lint, build, diff/scope, secret scan og fresh review
  eru GREEN. Handoff og commit mega aldrei kalla full suite GREEN.

## Task skjöl

Þegar Vaktirnar/Teskeið notar GoLive fyrir material task gildir task-owned
`docs/tasks/<external-id>/` líkanið úr sameiginlega workflowinu. Gamlar
handoff/TODO skrár eru history og skal ekki færa, endurnefna eða eyða án
sérstaks migration-plans.
