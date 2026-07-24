# TODO-091 v020 — Innbyggt Upplýsingar/Kort undirval

## Plan áfangans

1. Fjarlægja staka fljótandi kortahnappinn.
2. Halda þremur aðalsamhengjum: Spá, Akstur og Skilaboð.
3. Láta síðast valið Spá/Akstur samhengi stækka í
   `Samhengi | Upplýsingar | Kort`.
4. Muna sjálfstætt síðasta undirval Spár og Aksturs.
5. Varðveita samhengið þegar Skilaboð eru opnuð.
6. Prófa state-flæði, TypeScript og production build.

## Hvað var raunverulega gert

- Fljótandi Íslandskorts-/`Kort`-hnappurinn var fjarlægður.
- Top navigation er nú í röðinni:
  - Spá,
  - Akstur,
  - Skilaboð.
- Síðast valið Spá/Akstur samhengi er stækkað og inniheldur:
  - `Upplýsingar`,
  - `Kort`.
- Upphafssýnin er `Spá → Upplýsingar`.
- Spá og Akstur muna hvort notandinn var síðast í Upplýsingum eða Korti.
- Þegar Skilaboð eru opnuð:
  - síðasta Spá/Akstur group helst stækkað,
  - síðasta undirval sést með muted selection,
  - Skilaboð eru sjálf virkt aðalval.
- Þegar farið er aftur úr Skilaboðum í Spá/Akstur er sama undirval endurheimt.
- Ef smellt er aftur á virk Skilaboð er farið aftur í vistað síðasta samhengi.
- Desktop-close í Skilaboðum notar sama restore-flæði.
- Desktop-arrow sem lokar Akstursupplýsingum velur nú formlega
  `Akstur → Kort`, svo navigation-state og sýn haldast samstillt.
- Route calculation og route-switch sem opna panel uppfæra vistað Akstur-val
  í `information`.

## Notendatextar

- Bætt við:
  - íslenska: `Upplýsingar`,
  - enska: `Information`.
- `Kort`/`Map`, `Spá`/`Forecast`, `Akstur`/`Route` og Skilaboð/Messages
  endurnýta núverandi þýðingarlykla.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-2245-todo-091-v020-codex-embedded-context-map-navigation.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0.
  - 2 testaskrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0.
  - Engar whitespace-villur; aðeins line-ending viðvaranir í fyrirliggjandi
    worktree.
- `npm.cmd run build`
  - Exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.
- `git status --short`
  - Read-only staðfesting á worktree; ótengdum breytingum var ekki snúið við.

## Hvað mistókst eða var sleppt

- Dev server var ekki ræstur og browser/mobile sjónprófun var ekki framkvæmd.
- Engin ný component-test skrá var búin til fyrir allt navigation state-machine
  flæðið; það þarf manual localhost-prófun.

## Ákvarðanir

- Tvö sjálfstæð state, `weatherContextView` og `routeContextView`, geyma
  `information | map`.
- Fyrirliggjandi `isWeatherChaseOpen`, `isPanelOpen` og `isChatOpen` eru áfram
  canonical sýnileikastýringar fyrir núverandi panel componenta.
- Helper-flæði samstilla vistað undirval og panel visibility í stað þess að
  endurskrifa alla undirliggjandi panel-lógík.
- Virkt samhengi notar Teskeið primary state; vistað undirval undir Skilaboðum
  notar muted state svo tvö aðalval virðist ekki virk samtímis.
- Controls halda 40 px hæð og keyboard focus-rings samkvæmt `Design.md`.
- Textastærð undirvals er 10 px til að halda allri navigation í einni röð á
  mobile; touch target er samt full 40 px hæð.

## Áhætta

- 360 px sjónprófun þarf að staðfesta að expanded group, hinir tveir
  aðaltakkarnir og Teskeið-menu rúmist án overflow.
- `Information` er lengra á ensku og gæti krafist enn þéttari spacing á 360 px.
- State-flæði er handvirkt tengt við fyrirliggjandi route-calculation staði sem
  opna panel. Ný framtíðarflæði sem kalla beint á `setIsPanelOpen` þurfa einnig
  að uppfæra vistað undirval eða nota helper.
- Fjöldi eldri ócommittaðra breytinga er í worktree; þeim var ekki breytt eða
  snúið við utan nauðsynlegra sameiginlegra skráa.

## Supabase, SQL og production

- Engin SQL, Supabase, RLS, auth, secret, billing eða notendagagnabreyting.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi prófi nákvæmlega state-flæðin á mobile og desktop. Ef enska eða 360 px
þrengir of mikið að má stytta ensku í `Info` eða færa menu lítillega án þess að
breyta state-módelinu.

## Atriði sem Codex ætti sérstaklega að rýna

- Mobile width og horizontal overflow.
- Keyboard/focus order innan expanded group.
- Að síðasta undirval beggja contexta endurheimtist rétt eftir Skilaboð.
- Að engin gömul fljótandi kortastýring sé enn aðgengileg eða focusable.
- Að Spákort og Aksturskort haldi áfram að beita réttum layers.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

Prófa við 360, 390 og 460 px og desktop.

1. Gerðu hard refresh.
   - Vænt: `Spá | Upplýsingar | Kort`, `Akstur`, `Skilaboð`.
   - `Spá` group og `Upplýsingar` eru virk.
   - Enginn fljótandi Íslandskorts-/Kort-hnappur er yfir efni eða korti.
2. Smelltu á `Kort` innan Spár.
   - Vænt: Spákort birtist og `Kort` verður valið undirval.
   - Terrain, jöklaheiti og valin spáspjöld haldast rétt.
3. Smelltu á `Akstur`.
   - Vænt: navigation verður `Spá`, `Akstur | Upplýsingar | Kort`,
     `Skilaboð`.
   - Við fyrsta val er Akstur í `Upplýsingar`.
4. Smelltu á `Kort` innan Aksturs.
   - Vænt: Aksturskort birtist með réttum route-/Vegagerðarlögum.
5. Smelltu á `Spá`.
   - Vænt: fyrra undirval Spár, `Kort`, endurheimtist.
6. Veldu `Akstur → Upplýsingar`, síðan `Spá → Kort`, og farðu aftur í Akstur.
   - Vænt: Akstur man `Upplýsingar`; Spá man `Kort`.
7. Veldu `Akstur → Kort` og smelltu á `Skilaboð`.
   - Vænt: Akstur-group helst stækkað með Kort muted-valið.
   - Skilaboð eru greinilega virkt aðalval.
8. Smelltu aftur á `Akstur`.
   - Vænt: farið er beint aftur í `Akstur → Kort`.
9. Opnaðu Skilaboð aftur og smelltu aftur á virkan Skilaboð-hnapp.
   - Vænt: síðasta Spá/Akstur-samhengi endurheimtist; ekki autt millistig.
10. Á desktop, prófaðu `Loka` í Skilaboðum og vinstri örina í Akstur-panel.
    - Vænt: Skilaboð-close endurheimtir síðasta samhengi.
    - Akstur-örin velur og sýnir `Akstur → Kort`.
11. Prófaðu keyboard Tab/Enter/Space.
    - Vænt: rökrétt focus-röð, sýnileg focus-ring og enginn faldur gamall
      kortahnappur.
12. Athugaðu mobile.
    - Enginn horizontal overflow eða tvöföld lína.
    - Allir undirhnappar eru 40 px háir og snertanlegir.
    - Teskeið-menu helst sýnilegt.

Prófunin snertir ekki Supabase, production-gögn, auth eða billing.
