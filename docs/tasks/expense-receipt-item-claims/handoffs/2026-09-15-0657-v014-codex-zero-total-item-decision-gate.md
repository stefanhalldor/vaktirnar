# Zero-total receipt lines — product decision gate

## Mannamálsniðurstaða

Beini `Nota ChatGPT eða annað app` hnappurinn er lagaður: hann opnar prompt og
innlímingarreit strax, án þess að krefjast myndar eða kalla á server. Mynd er
enn valin þegar notandi býr til varðveitt drög, í samræmi við samþykkta
myndvarðveislu.

Límda AI-svarið var gilt JSON og heildin stemmdi. Einu ógildu gögnin voru tvær
complimentary vörulínur með `kind: item` og `total_minor: 0`. SQL179 og current
strict parser leyfa aðeins jákvætt `total_minor` fyrir úthlutanlegan item.

## Staða

- Direct manual open correction: 49/49 focused tests GREEN.
- Type-check og Production build voru GREEN fyrir correction; affected focused
  scope var endurkeyrt GREEN eftir lifecycle-fix.
- Misheppnað upload eða manual import opnar nú exact durable owner draft svo
  notandi geti endurnotað eða eytt því; retry býr ekki til óaðgengilega mynd.
- Manual prompt biður ný svör um að sleppa zero-total línum.
- Parser, SQL179, schema og fjárhagsmerking eru óbreytt.
- Engin SQL var keyrð.

## Eigendaákvörðun

Ákveða þarf hvort Teskeið megi sjálfkrafa sleppa nákvæmlega gildum
`kind: item, total_minor: 0` línum við import. Ráðlögð niðurstaða er já: þær
bera engan kostnað og breyta hvorki receipt total né skiptingu. Normaliseringin
verður exact, malformed zero lines verða áfram rejected og SQL179 verður
óbreytt.

Ef zero-total línur eiga að varðveitast sem sýnilegir liðir þarf annan product
og SQL179 samning og það er stærra scope.

## Localhost checks for Stebbi

Engin frekari notendaprófun fyrr en zero-total ákvörðunin liggur fyrir. Eftir
samþykkt og GREEN gates má líma sama AI-svar aftur; vænt niðurstaða er að
kostnaðarberandi línur opnist með samtölunni 1.663,00 EUR.
