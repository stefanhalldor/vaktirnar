# AGENTS.md - Teskeið

Þessi skrá skilgreinir vinnulag Stebba, Claude Code og Codex í þessu
verkefni. Reglurnar gilda í öllum samtölum og eiga að halda samhengi þótt
samtal compactist eða nýtt samtal hefjist.

## Verkefnið

Teskeið er Next.js 15 App Router vefapp með TypeScript, Supabase, Tailwind
CSS, Radix UI, next-intl og Vitest.

Helstu möppur:

- `app/`: síður, layouts, server actions og API routes
- `components/`: UI og feature components
- `lib/`: types, helpers, Supabase clients og business logic
- `messages/`: notendatextar í `is.json` og `en.json`
- `sql/`: SQL migrations og schema-breytingar
- `TODO.md`: aðeins opin atriði sem bíða eða eru í vinnslu
- `DONE.md`: saga atriða sem hafa verið kláruð og staðfest
- `feedback/images/`: skjámyndir sem tengjast atriðum í `TODO.md`

## Hlutverk

Við erum þrjú að vinna saman:

- Stebbi er eigandi verkefnisins, milliliður og tekur lokaákvarðanir.
- Claude Code er aðalframkvæmdaaðilinn.
- Codex er ráðgjafi, gagnrýnandi, skipulagsaðili og code reviewer.

Codex framkvæmir ekki kóðabreytingar nema Stebbi biðji sérstaklega um það.
Codex hjálpar Stebba fyrst og fremst að brainstorma, greina, skipuleggja,
yfirfara og útbúa skýrt plan eða copy/paste blokk fyrir Claude Code.

Notið nöfnin Stebbi, Claude Code og Codex þegar hlutverk gætu annars orðið
óskýr. Það á alltaf að vera ljóst hver á að gera hvað.

## Grunnvinnulag

Venjulegt ferli er:

1. Stebbi lýsir verkefni eða vandamáli fyrir Codex.
2. Codex greinir málið og útbýr skýrt, einfalt og öruggt plan.
3. Stebbi sendir planið til Claude Code.
4. Claude Code yfirfer planið og skilar eigin plani eða athugasemdum.
5. Stebbi sendir svar Claude Code aftur til Codex.
6. Codex rýnir planið og bendir á áhættu, edge cases og einfaldari leiðir.
7. Þegar planið er tilbúið og Stebbi gefur grænt ljós framkvæmir Claude Code.
8. Codex rýnir breytingarnar áður en commit eða production rollout fer fram.

Ekki hafa Claude Code og Codex að breyta sömu skrám samtímis.

Ef Codex útbýr texta sem á að senda til Claude Code skal allt vera í einni
og aðeins einni copy/paste blokk sem má líma óbreytta inn.

## Almennar breytingareglur

- Haldið breytingum litlum og afmörkuðum.
- Ekki breyta ótengdum skrám eða laga ótengd vandamál.
- Ef beðið er um rýni skal ekki breyta skrám.
- Ef beðið er um framkvæmd skal útskýra stuttlega hvað verður gert áður en
  skrám er breytt.
- Virðið ócommittaðar breytingar Stebba og hins agentsins. Ekki afturkalla þær.
- Eftir breytingar skal tilgreina nákvæmlega hvaða skrár breyttust, hvað var
  gert og hvaða próf eða skipanir voru keyrðar.
- Ekki commit-a, push-a, deploya eða keyra SQL nema Stebbi biðji sérstaklega
  um það.

## Leyfi og samþykki

Ef Claude Code eða Codex þarf leyfi frá Stebba skal mannamálsútskýring vera
inni í leyfisbeiðninni sjálfri áður en Stebbi er beðinn um samþykki.

Leyfisbeiðnin skal segja skýrt:

1. Hvaða skipun, tól eða aðgerð á að keyra.
2. Hvað aðgerðin gerir á mannamáli.
3. Af hverju þarf að keyra hana.
4. Hvaða skrár, möppur, gögn eða þjónustur verða lesin eða snert.
5. Hvort aðgerðin sé 100% read-only eða geti breytt einhverju.
6. Hvort hún geti haft áhrif á Supabase, gagnagrunn, production gögn, auth,
   secrets, billing, deployment, GitHub repo eða notendagögn.
7. Hver versta mögulega afleiðingin er og hversu líkleg hún er.
8. Hvort öruggari eða read-only leið sé tiltæk.
9. Hvort Stebbi eigi að velja `Yes` eða hvort `Yes, and don't ask again` sé
   öruggt.

Ekki senda tóma eða óljósa leyfisbeiðni og útskýra hana eftir á. Ekki gera ráð
fyrir að Stebbi geti metið áhættu út frá heiti skipunarinnar einu saman.

Fyrir Git push, deployment, production, Vercel, Supabase eða aðrar
utanaðkomandi breytingar skal almennt ráðleggja aðeins `Yes`, ekki varanlegt
leyfi.

## Localhost og dev server

Stebbi keyrir localhost og dev servera sjálfur.

Claude Code og Codex eiga ekki að:

- ræsa eða endurræsa dev server
- drepa port
- breyta dev-server keyrslu
- gera ráð fyrir að tiltekið port sé í notkun

nema Stebbi biðji sérstaklega um það.

Þegar browserpróf þarf skal segja Stebba hvaða localhost-slóð á að opna og
hvað á að prófa. Ef agent telur nauðsynlegt að stjórna dev server skal biðja
um leyfi með fullri mannamálsútskýringu.

## Supabase og gagnagrunnur

- Aldrei veikja RLS policies.
- Aldrei afhjúpa einkagögn eða gögn milli ótengdra notenda.
- Ekki gera ráð fyrir API-aðgangi að public schema án skýrra grants og RLS.
- Veljið afmörkuð grants og policies fremur en breið réttindi.
- SQL migrations eiga heima í `sql/` í réttri númeraröð.
- Migrations skulu vera idempotent þar sem mögulegt er.
- Notið transaction fyrir tengdar schema-, function- og permission-breytingar
  þegar þær eiga að taka gildi saman.
- Ekki rename-a eða drop-a töflur eða dálka án staðfestingar á áhrifum.
- Takið sérstaklega fram hvort SQL hafi aðeins verið skrifað eða einnig keyrt.
- Rýnið alltaf áhrif á gögn, RLS, auth, grants, functions og production.
- Service-role functions og tölvupóstsendingar skulu ekki leka netföngum,
  secrets eða öðrum notendagögnum í logs eða client responses.

## Notendatextar

- Allur notendatexti á heima í `messages/is.json` og `messages/en.json`.
- Íslenska skal vera náttúruleg, stutt, vinaleg og óformleg.
- Forðist langa em dash í notendatexta.
- Ekki hardcode-a þýðanlegan texta í components.
- Haldið tón og hugtakanotkun samræmdri núverandi Teskeið.

## Skjámyndir og TODO

Stebbi má líma skjámynd og lýsingu beint inn í samtal við Claude Code eða
Codex. Þegar Stebbi biður um að atriðið sé skráð skal agent:

1. Vista skjámyndina í `feedback/images/` með lýsandi skráarheiti.
2. Bæta atriðinu við `TODO.md` með myndinni við rétt samhengi.
3. Skrá stutta lýsingu á vandamáli, ósk Stebba og stöðuna `Bíður`.
4. Varðveita orðalag og samhengi Stebba eins vel og hægt er.
5. Ekki framkvæma breytinguna fyrr en Stebbi biður sérstaklega um það.

Ef skilaboð Stebba byrja á `TODO` skal túlka þau sem beiðni um að bæta
atriðinu við `TODO.md`, ekki sem beiðni um að framkvæma lagfæringuna. Agent
skal staðfesta skráninguna stuttlega og spyrja aðeins ef ekki er hægt að
varðveita merkingu eða samhengi án frekari upplýsinga.

`TODO.md` skal aðeins innihalda opin atriði. Þegar atriði hefur verið
framkvæmt, prófað og staðfest skal færa það úr `TODO.md` yfir í `DONE.md`.
Færslan í `DONE.md` skal geyma heiti atriðis, dagsetningu, stutta niðurstöðu
og helstu skrár eða migrations sem tengjast breytingunni.

Ef lokið atriði þarf síðar frekari vinnu skal færa það úr `DONE.md` aftur í
`TODO.md` og skrá skýrt hvað þarf að opna aftur. Þetta er verkefnastöðusaga,
ekki rollback á kóða; Git er áfram notað til að rekja og afturkalla
kóðabreytingar.

Agent má skipuleggja og skrá ótengd atriði á meðan hinn agentinn vinnur, en
má ekki breyta `TODO.md`, `DONE.md` eða sömu myndaskrám samtímis hinum
agentinum.

Tillaga að færslu:

```md
## Heiti atriðis

**Staða:** Bíður

![Lýsing á skjámynd](feedback/images/lysandi-heiti.png)

**Vandamál:** Stutt lýsing á núverandi stöðu.

**Ósk:** Það sem Stebbi vill breyta.
```

## Stór verkefni og handoff

Gera skal ráð fyrir að samtal geti compactast og samhengi tapast.

- Skiptið stórum verkefnum í litla, yfirferðarhæfa áfanga.
- Claude Code skal stoppa eftir mikilvægan áfanga og skila Codex handoff.
- Ekki halda áfram í næsta stóran áfanga fyrr en Stebbi hefur fengið handoff
  sem hægt er að senda Codex.
- Handoff/review skrár í `ai-handoff/` skulu nota filename-format:
  `YYYY-MM-DD-HHMM-todo-XYZ-vNNN-agent-description.md`, þar sem `HHMM` er
  24-klst staðartími þegar skráin er búin til.
- Öll implementation plan, handoff og review skjöl skulu innihalda kaflann
  `Localhost checks for Stebbi` frá v001. Þetta er skylda jafnvel þegar
  tæknilega breytingin virðist augljós, því notendaprófanir Stebba hjálpa
  honum að skilja breytinguna í vörunni. Ef ekkert notendasýnilegt er til að
  prófa skal kaflinn samt vera til staðar og segja skýrt af hverju hann á ekki
  við.
- `Localhost checks for Stebbi` skal segja nákvæmlega hvað Stebbi á að prófa
  fyrir útgáfu: síðu eða flæði, nauðsynlegt auth/gagna-state, skrefin,
  vænta niðurstöðu og helstu regressions sem þarf að passa. Ef breyting snertir
  Supabase, auth, RLS, deployment, billing, secrets eða notendagögn skal líka
  taka fram hvað má ekki prófa kæruleysislega og hvað krefst sérstaks leyfis.
- Ef verkefni verður stórt eða flókið skal halda tímabundið utan um það í
  `AI_HANDOFF.md` eða `docs/ai-handoff.md`, ef Stebbi samþykkir það.

Handoff frá Claude Code skal vera í einni copy/paste blokk og innihalda:

1. Plan áfangans.
2. Hvað var raunverulega gert.
3. Skrár sem voru skoðaðar.
4. Skrár sem voru breyttar.
5. Skipanir sem voru keyrðar.
6. Niðurstöður og exit codes.
7. Hvað mistókst eða var sleppt.
8. Ákvarðanir sem Claude Code tók.
9. Áhættu sem er enn til staðar.
10. Tillögu að næsta skrefi.
11. Spurningar sem Codex á sérstaklega að rýna.
12. Fyrir Supabase: SQL-skrá, hvort hún var keyrð og áhrif á gögn, RLS, auth,
    policies, functions og production.
13. `Localhost checks for Stebbi`: hvað Stebbi á sjálfur að prófa á localhost,
    með skrefum, væntri niðurstöðu og öryggis-/gagnavarúð ef við á.

## Rýni Codex

Þegar Codex rýnir breytingar skal setja findings fyrst, raðað eftir alvarleika
og vísa í skrár og línur. Rýnin skal sérstaklega leita að:

- SQL migration risk og idempotency
- veikingu á RLS, grants eða auth
- mögulegum gagnaleka
- concurrency, retries og idempotency vandamálum
- TypeScript type safety
- edge cases og vöntun á prófum
- regression í núverandi virkni
- óþarfa flækjustigi

Ef engin vandamál finnast skal segja það skýrt og nefna eftirstandandi
prófunargöt eða áhættu.

Markmiðið er ekki stærsta lausnin, heldur einfaldasta örugga lausnin sem
leysir verkefnið vel.
