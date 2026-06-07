# Design.md - Hönnunarkerfi Teskeiðar

Þessi skrá er hönnunarhandbók Teskeiðar fyrir innskráða app-upplifun og
nýja Teskeið-components. Hún skilgreinir sjónræna stefnu, viðmótsmynstur og
reglur um endurnýtingu.

Kóðinn er endanleg source of truth fyrir útfærslu. Ef þessi skrá og
raunverulegur component stangast á skal fyrst staðfesta hvort componentinn sé
Teskeið-component eða eldri Krakkavaktar-component. Ekki afrita gamalt lúkk
inn í nýja Teskeið-virkni af vana.

## Markmið

Teskeið er rólegt og gagnlegt hversdagsapp. Innskráður notandi á fljótt að sjá:

- hvað þarf athygli
- hvað hefur gerst nýlega
- hvaða Teskeiðar eru tiltækar
- hvaða aðgerð er eðlileg næst

Upplifunin á að vera app, ekki markaðssíða eða enterprise-dashboard.

Forgangsröðin er:

1. Skýrleiki
2. Nothæfi
3. Samræmi
4. Hlýja og karakter
5. Skraut

## Source of truth

Við hönnun og útfærslu skal nota þessa röð:

1. Staðfest Teskeið design tokens í `app/globals.css`
2. Staðfest Teskeið-components í `components/ui/`
3. Samþykkt Teskeið-mynstur í `components/loans/` og `components/teskeid/`
4. Reglur og component-skrá í þessu skjali
5. Skjámyndir og viðmið í `design-assets/`

`components/ui/` er ekki sjálfkrafa allt canonical. Núverandi components sem
nota violet, gamalt gray-theme eða Krakkavaktar-mynstur þarf að samræma við
Teskeið áður en þeir eru notaðir sem fyrirmynd í nýjum skjám.

## Sjónræn stefna

Teskeið á að vera:

- mobile-first
- bjart, rólegt, hlýtt og traust
- þétt en ekki þröngt
- mannlegt og praktískt
- örlítið leikandi án þess að verða barnalegt
- laust við óþarfa dashboard- eða marketing-stemningu

Forðist:

- stór hero-svæði í innskráða appinu
- decorative gradients, bokeh og floating orbs
- kort inni í kortum
- of mörg stór, kringlótt kort
- fjólublátt Krakkavaktar-lúkk
- einlita græna fleti án hlutlausra og hlýrra mótvægislita
- hardcode-aða stíla sem endurtaka þegar til component eða token

## Litir

Canonical Teskeið-tokens eru skilgreind í `app/globals.css`.

| Hlutverk | Token | Núverandi viðmið |
|---|---|---|
| Bakgrunnur | `background` | hlýr ljós bakgrunnur, nálægt `#fbf9f4` |
| Aðaltexti | `foreground` | mjög dökkur hlutlaus texti |
| Kort | `card` | hvítur |
| Aðallitur | `primary` | dökkur Teskeið-grænn, nálægt `#154212` |
| Hover-grænn | primary hover | nálægt `#2d5a27` |
| Megintexti 2 | neutral text | nálægt `#42493e` |
| Daufur texti | muted text | nálægt `#72796e` |
| Línur | `border` | ljós, hlý hlutlaus lína |
| Accent | `accent` | hlýr brúnn/appelsínugulur |
| Villa | `destructive` | rauður, aðeins fyrir villur og eyðingu |

Reglur:

- Notið semantic tokens þegar það er mögulegt.
- Nýr component má ekki kynna nýjan brand-lit án samþykkis.
- Rauður er ekki secondary action-litur.
- Gulbrúnn/amber er fyrir viðvörun eða tímabundna stöðu.
- Status-litir mega ekki vera eina leiðin til að miðla merkingu.

### Núverandi tækniskuld

Sumir `components/ui/` components nota enn `violet-*` og `gray-*` sem
aðaltheme. Þeir eru reusable tæknilega, en ekki fullgildir Teskeið-primitives
fyrr en variantar þeirra nota Teskeið-tokens.

Ekki laga alla tækniskuld í einu. Samræmið aðeins þá primitives sem nýr
verkpakki þarf og bætið regression-prófum þar sem hegðun breytist.

## Letur og textastig

Appið notar Inter úr `app/layout.tsx`.

Viðmið:

| Notkun | Stærð og þyngd |
|---|---|
| Page title | `text-xl` eða `text-2xl`, `font-semibold` |
| Section title | `text-base` eða `text-lg`, `font-medium/semibold` |
| Card title | `text-sm` eða `text-base`, `font-medium` |
| Body | `text-sm` eða `text-base` |
| Metadata | `text-xs`, muted |
| Button | `text-sm`, `font-medium` |

Reglur:

- Ekki nota hero-scale fyrirsagnir inni í appinu.
- Letter spacing skal vera 0 nema tæknilegt input krefjist annars, t.d. kóði.
- Texti má ekki skarast eða flæða út úr controls.
- Nota skal `truncate` aðeins þegar fullur texti er aðgengilegur annars staðar.
- Allur notendatexti skal vera í `messages/is.json` og `messages/en.json`.

## Layout

### App shell

- Mobile-first, full breidd upp að afmörkuðu max-width.
- Form og einfaldir feature-skjáir: yfirleitt `max-w-lg`.
- Þétt innri app-yfirlit: yfirleitt `max-w-md` til `max-w-lg`.
- Lárétt padding í síma: 16-20 px.
- Header-hæð: um 56 px.
- Aðalbil milli sections: 24 px.
- Bil milli tengdra atriða: 8-16 px.

### Responsive hegðun

- Hanna fyrst við 360-460 px breidd.
- Desktop á að nýta aukið rými án þess að teygja leslínur eða controls óhóflega.
- Fixed controls, segmented controls og icon buttons skulu hafa stöðugar stærðir.
- Primary action skal vera auðfundin, en ekki alltaf floating action button.
- Neðsta efni skal hafa nægt rými fyrir mobile browser chrome og safe areas.

## Yfirborð og form

### Page sections

Sections eru yfirleitt óinnrammaðir hlutar með fyrirsögn og efni. Ekki setja
heila page section í floating card.

### Cards

Kort eru fyrir einstök endurtekin atriði, til dæmis lán, boð eða nýlega færslu.

Canonical Teskeið-kort:

- hvítur eða mjög ljós semantic bakgrunnur
- fíngerð border, oft `border-black/5` eða semantic border
- lítil eða engin shadow
- radius skal stefna að 8-12 px fyrir nýja components
- 12-16 px padding
- skýr textastig og ein aðalmerking

Núverandi lánaspjöld nota `rounded-2xl`. Þau eru gild núverandi mynstur en
ekki ástæða til að auka radius frekar eða setja kort inni í kort.

### Borders og shadows

- Borders bera meginuppbyggingu.
- Shadows eiga að vera mjög daufar og aðeins þegar þær bæta hierarchy.
- Ekki nota þunga shadow til að láta alla sections fljóta.

## Component-skrá

Staðan segir hvort component sé canonical fyrir nýja Teskeið-vinnu.

| Component | Skrá | Staða | Notkun |
|---|---|---|---|
| Button | `components/ui/Button.tsx` | Þarf theme-samræmingu | Primary, secondary, ghost og danger commands |
| Input | `components/ui/Input.tsx` | Þarf theme-samræmingu | Textainntak með label og villu |
| Card | `components/ui/Card.tsx` | Þarf radius/theme-rýni | Einstök endurtekin atriði |
| Badge | `components/ui/Badge.tsx` | Þarf theme-samræmingu | Stutt staða eða talning |
| Avatar | `components/ui/Avatar.tsx` | Þarf theme-samræmingu | Upphafsstafir eða mynd |
| Loan segmented control | `components/loans/LoanList.tsx` | Samþykkt mynstur | Gagnkvæmir view/filter valkostir |
| Loan tabs | `components/loans/LoanList.tsx` | Samþykkt mynstur | Aðskilin gagnasöfn eða stöður |
| Loan card | `components/loans/LoanCard.tsx` | Samþykkt feature-mynstur | Einstakt lán |
| Pending invitation | `components/loans/PendingInvitationCard.tsx` | Samþykkt feature-mynstur | Boð sem þarf athygli |

Components sem vantar áður en heimaskjár TODO #1 verður útfærður:

- `TeskeidButton` eða Teskeið-theme á núverandi `Button`
- `IconButton`
- `TeskeidInput` eða Teskeið-theme á núverandi `Input`
- `SegmentedControl`
- `Tabs`
- `PageHeader`
- `SectionHeader`
- `ListRow`
- `EmptyState`
- `StatusBadge`

Ekki þarf að búa alla þessa components til fyrirfram. Claude Code skal aðeins
extract-a component þegar:

- hann er notaður á fleiri en einum stað
- hann fjarlægir raunverulega tvítekningu
- hann tryggir mikilvægt samræmi eða accessibility
- hann á sér skýrt og stöðugt API

## Controls

### Buttons

- Primary: dökkgrænn bakgrunnur, hvítur texti.
- Secondary: ljós/hvítur bakgrunnur með border.
- Ghost: icon eða texti án þungs yfirborðs.
- Danger: rauður, aðeins fyrir skaðlega aðgerð.
- Icon buttons skulu nota Lucide-icon, `aria-label` og tooltip ef merking er
  ekki augljós.
- Ekki nota textahnapp þar sem kunnuglegt icon eitt og sér er skýrara.
- Loading state má ekki breyta breidd controls.

### Segmented controls

Notið fyrir 2-4 gagnkvæma valkosti, t.d. „Allt“, „Ég lánaði“ og
„Ég fékk lánað“.

- Einn valkostur er alltaf virkur.
- Control hefur fasta hæð og jafna reiti.
- Virkur valkostur notar primary.
- Þetta er ekki sama mynstur og tabs.

### Tabs

Notið til að skipta milli skyldra gagnasafna eða views, t.d. „Í láni“ og
„Skilað“.

- Virkur tab fær texta og underline í primary.
- Tabs mega ekki líta út eins og primary buttons.
- Haldið fjölda tabs lágum á mobile.

### Inputs

- Label skal alltaf vera sýnilegt.
- Placeholder kemur ekki í stað labels.
- Hæð venjulegs input er um 40 px.
- Focus notar primary border og daufan primary ring.
- Villa birtist nálægt inputi með skýrum texta.
- Required/optional merking skal vera mannleg og samræmd.

### Toggle, checkbox og val

- Binary stilling notar toggle eða checkbox.
- Gagnkvæmir fáir valkostir nota segmented control.
- Lengri listi valkosta notar select/menu.
- Numeric stilling notar input, stepper eða slider eftir samhengi.

## Navigation og header

Header á að:

- vera lágvær og stöðugur
- sýna síðutitil eða Teskeið-brand
- hafa back-action þegar notandi fer í undirflæði
- nota icon fyrir settings/profile þegar pláss er lítið
- forðast margar jafnvægar aðalaðgerðir

Ný innskráð Teskeið-upplifun skal ekki byggja á gamla `components/layout/`
Krakkavaktar-shellinu nema það hafi fyrst verið samræmt við Teskeið.

## Heimaskjár innskráðra notenda

TODO #1 skal fylgja þessum ramma:

1. Teskeið-brand og profile/settings aðgerð í header.
2. Stutt persónuleg kveðja með `display_name`.
3. „Hvað er á dagskrá?“ með virkum Teskeiðum.
4. „Lánað og skilað“ fremst á meðan það er fyrsta virka Teskeiðin.
5. Raunveruleg talning á opnum atriðum eða boðum.
6. „Nýlegt“ úr raunverulegum gögnum.
7. Skýr tóm staða þegar engin gögn eru til.

Heimaskjárinn má ekki:

- sýna tilbúin sýnidæmi sem líta út eins og raunveruleg gögn
- vera marketing landing page
- búa til óvirka controls án skýrrar disabled stöðu
- endurtaka allt innihald feature-síðna
- kalla á breiðari gagnagrunnsaðgang en notandinn þarf

Fyrir óvirkar framtíðar-Teskeiðar skal velja annaðhvort:

- fela þær þar til þær eru nothæfar, eða
- sýna þær skýrt sem óvirkar/„síðar“, án falskrar virkni

## States sem hver component þarf

Viðeigandi components skulu gera ráð fyrir:

- default
- hover
- focus-visible
- active/selected
- disabled
- loading
- empty
- error
- success eða completed
- overdue/warning þegar domainið krefst þess

Loading, label eða icon má ekki valda layout shift.

## Accessibility

- Allt viðmót skal vera keyboard-aðgengilegt.
- Focus-visible þarf að sjást skýrt.
- Icon-only buttons þurfa `aria-label`.
- Form controls þurfa tengd labels.
- Litir einir mega ekki miðla stöðu.
- Texti og controls þurfa fullnægjandi contrast.
- Touch targets skulu almennt vera minnst 40x40 px.
- Reduced motion skal virt þegar animation er notuð.
- Heading hierarchy skal fylgja merkingu skjásins.

## Microcopy

Teskeið-tónn er:

- stuttur
- hlýr
- beinn
- praktískur
- örlítið leikandi

Forðist:

- corporate orðalag
- tæknileg villuskilaboð
- óþarfa útskýringar á sjálfsögðum controls
- langa em dash
- að kenna notanda um villu

Dæmi:

- „Engin opin lán“ fremur en „Engar færslur fundust“
- „Vista“ fremur en „Staðfesta innsendingu“
- „Reyndu aftur síðar“ fremur en raw database/API villa

## Icons og myndmál

- Notið Lucide-icons þegar viðeigandi icon er til.
- Haldið stroke og stærð samræmdri innan sama controls.
- Icons skulu styðja merkingu, ekki vera handahófskennt skraut.
- Brand- og feature-myndir skulu koma úr samþykktum assets.
- Ekki teikna ný SVG-logo eða feature-illustration ef samþykkt asset er til.

## Hreyfing

- Animation skal útskýra state-breytingu eða hierarchy.
- Notið stutt og róleg transitions.
- Forðist stöðuga eða skrautlega hreyfingu í operational app-flæði.
- Controls mega ekki hoppa eða breyta stærð við hover/loading.

## Ferli fyrir nýjan skjá

Áður en Claude Code útfærir nýjan stóran skjá skal:

1. Lesa þessa skrá.
2. Skoða nálæga Teskeið-skjái og components.
3. Skrá hvaða canonical components verða endurnýttir.
4. Skrá hvaða primitives vantar og af hverju.
5. Leggja fram mobile-first wireframe eða component-tree.
6. Staðfesta raunverulegar data sources og states.
7. Fá samþykki Stebba áður en útfærsla hefst.

Eftir útfærslu skal athuga:

- mobile og desktop
- overflow og text wrapping
- loading, empty og error states
- keyboard/focus
- íslensku og ensku
- raunveruleg gögn, ekki placeholders
- að enginn gamall Krakkavaktar-stíll hafi lekið inn

## Definition of done fyrir TODO #1

Heimaskjárinn telst ekki tilbúinn fyrr en:

- hann notar staðfest Teskeið-tokens
- sameiginleg controls koma úr reusable components
- mobile viewport er aðalviðmið og desktop er sannreynt
- engin texta- eða control-overlap finnst
- talningar og „Nýlegt“ nota raunveruleg gögn
- empty, loading og error states eru til
- allur texti er í báðum message-skrám
- keyboard og focus-visible virka
- próf ná yfir gagnavinnslu og mikilvægar states
- Stebbi hefur yfirfarið skjámyndir af mobile og desktop
- Codex hefur rýnt diffið áður en commit eða deploy fer fram

## Viðhald

Þegar nýr canonical component eða nýtt mynstur er samþykkt skal uppfæra
component-skrána hér. Ekki skrá tilraunakenndan eða einnota component sem
staðal fyrr en hann hefur verið notaður og samþykktur.
