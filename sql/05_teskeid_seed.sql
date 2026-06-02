-- Teskeið seed data — 12 hugmyndir
-- Idempotent: ON CONFLICT (slug) DO NOTHING

INSERT INTO ideas (title, slug, short_description, problem_description, possible_solution, category, status, source, is_public)
VALUES

(
  'Lánað og skilað',
  'lanad-og-skilad',
  'Haltu utan um hluti sem þú hefur lánað eða fengið að láni, án þess að þurfa að muna þetta sjálf/ur.',
  'Bækur, verkfæri, barnadót, föt, hleðslutæki og allt hitt sem fer á milli fólks hverfur oft bara inn í hversdaginn. Svo man enginn alveg hver fékk hvað, hvenær það átti að skila því eða hvort það sé vandræðalegt að minna á það.',
  'Einfalt yfirlit yfir hluti sem þú hefur lánað eða fengið að láni. Skráðu hlutinn, manneskjuna og skiladag ef hann er til. Teskeið getur sent áminningu þegar tími er kominn til að skila eða biðja fallega um að fá hlutinn aftur.',
  'Lánað og skilað', 'idea', 'seed', true
),

(
  'Útlagt og endurgreitt',
  'utlagt-og-endurgreitt',
  'Haltu utan um það sem þú leggur út fyrir aðra, hvað er búið að endurgreiða og hvað er enn opið.',
  'Einn kaupir miðana, annar borgar gjöfina, einhver leggur út fyrir mat, ferð eða kostnaði tengdum börnunum. Svo líður tíminn, enginn vill vera leiðinlegur og minna á þetta, en samt er óþægilegt að vita ekki hvað er búið og hvað stendur eftir.',
  'Einfalt yfirlit yfir útlagðan kostnað, hver á eftir að borga og hvað er frágengið. Hægt væri að ganga frá greiðslunum beint inni í Teskeið, svo þetta þurfi ekki að enda í awkward skilaboðum, excel-skjali eða minni hvers og eins.',
  'Útgjöld', 'idea', 'seed', true
),

(
  'Maki / kæró',
  'maki-kaero',
  'Hjálpar pörum að rækta sambandið, prófa eitthvað nýtt saman og muna að hlúa að hvort öðru.',
  'Það er auðvelt að festast í rútínu. Vinnan, börnin, heimilið og síminn taka plássið, og allt í einu eru stefnumótin, litlu óvæntu hlutirnir og samtölin farin að detta aftar.',
  'Einfalt tól fyrir pör með mánaðarlegum hugmyndum, litlum áskorunum og minningum um að gera eitthvað fallegt saman. Kvöldverður, göngutúr, helgarferð eða eitthvað nýtt sem þið hafið aldrei prófað.',
  'Pör', 'idea', 'seed', true
),

(
  'Heimilið',
  'heimilid',
  'Dreifðu heimilisstörfum á fjölskylduna á sanngjörnum og gagnsæjan hátt.',
  'Alltaf sama manneskjan þvær upp. Alltaf sama manneskjan kaupir inn. Þetta skapar óánægju þegar það er ekki sýnilegt.',
  'Hlutlæg dreifing heimilistarfa. Allir geta séð hvað hverjum er ætlað og hvað er búið.',
  'Heimili', 'idea', 'seed', true
),

(
  'Umönnun',
  'umonnun',
  'Umönnun er nú þegar til á umonnun.is. Hún tekur eitt mikilvægt atriði úr öllu hinu og setur það á einfaldan stað.',
  'Þegar einhver sem þér þykir vænt um þarf aðstoð ætti utanumhaldið ekki að týnast í Messenger, fjölskylduspjalli, minnismiðum og minni hvers og eins. En það gerist alltof oft. Skilaboð dreifast, ábyrgðin verður óljós og hlutir detta á milli, ekki vegna þess að engum sé ekki sama, heldur vegna þess að það vantar einn einfaldan stað til að vera samstíga.',
  'Umönnun er tilbúin lausn fyrir umönnunarhringi, ættingja, vini og nágranna sem þurfa að láta hlutina ganga upp saman. Hún hjálpar fólki að sjá hver kemur hvenær, hvað hefur verið gert og hverju gleymdist að segja frá. Hún er afmörkuð teskeiðarútfærsla, eitt mikilvægt atriði tekið út úr öllu hinu til að einfalda lífið aðeins. Umönnunarappið er hægt að sækja í App Store og Play Store, og þegar fram líða stundir gæti hún best átt heima inni í Teskeið.',
  'Umönnun', 'launched', 'seed', true
),

(
  'Út að leika',
  'ut-ad-leika',
  'Sendu leikboð á barnið, ekki á rétta foreldrið. Kerfið finnur hver er með barnið hverju sinni.',
  'Þegar barn vill hitta vin sinn þarf foreldri oft að vita hvort það á að senda á mömmu, pabba, bæði eða einhvern annan. Þetta er sérstaklega snúið þegar foreldrar eru fráskildir, barnið er á flakki milli heimila eða frænka, afi eða amma er stundum með barnið.',
  'Einfalt tól þar sem barnið er í miðjunni. Bakvið prófíl barnsins geta verið mamma, pabbi, frænka eða annar umönnunaraðili, og tilkynningar fara til þeirra sem eru með barnið þá stundina. Fullorðnir geta líka tengt prófíla eða samfélagsmiðla, svo aðrir foreldrar fái betri tilfinningu fyrir hver er hinum megin.',
  'Börn', 'idea', 'seed', true
),

(
  'Gæludýravaktin',
  'gaelodyravaktin',
  'Halda utan um fóðrun, gönguferðir og dýralæknaverð gæludýrsins.',
  'Tveir í húsinu fóðra hundinn tvisvar sama dag. Eða gleyma að fara í gönguferð. Eða muna ekki hvenær bólusetningin var.',
  'Einfalt tól þar sem gæludýrið hefur sín gögn og þú getur séð hvenær hvað var gert.',
  'Umönnun', 'idea', 'seed', true
),

(
  'Mótavaktin',
  'motavaktin',
  'Heldur utan um sjoppuvaktir, gistivaktir, akstur og önnur foreldrahlutverk í kringum mót og viðburði barna.',
  'Foreldravaktir í kringum mót enda oft í Google Sheets, Messenger þræði og óskýrum skilaboðum. Einhver á að taka sjoppuvakt, annar gistivakt, einhver þarf að keyra eða mæta í uppsetningu, en það er erfitt að sjá hver er búinn að skrá sig og hvað vantar enn.',
  'Einfalt vaktayfirlit fyrir foreldrahópinn þar sem hægt er að skrá sig á verkefni, sjá hvaða vaktir eru lausar og fá skýra mynd af því hver gerir hvað. Minna sheets-rugl, færri týnd skilaboð og betri yfirsýn fyrir alla.',
  'Viðburðir', 'idea', 'seed', true
),

(
  'Sagan okkar',
  'sagan-okkar',
  'Lifandi lífssaga sem byggist upp smátt og smátt, með sögum, myndum, stöðum og augnablikum úr lífinu.',
  'Minningar týnast auðveldlega í símanum, á Facebook, í gömlum tölvum og í höfðinu á fólki. Svo kemur seinna að einhver vill vita hvernig húsið leit út, hvaða lag var alltaf spilað, hvernig þið kynntust eða hvað barnið sagði einu sinni sem allir hlógu að.',
  'Sagan okkar er hugmynd að lifandi ævisögu sem byrjar snemma og vex með manneskjunni. Ekki þung bók sem er skrifuð eftir á, heldur litlar færslur yfir tíma, ein saga, ein mynd, einn staður, eitt augnablik. Drög að verkefninu eru á saganokkar.is, en það gæti vel endað sem ein af teskeiðunum inni í Teskeið.',
  'Minningar', 'idea', 'seed', true
),


(
  'Gjafir og óskir',
  'gjafir-og-oskir',
  'Óskalistar og gjafasaga fyrir fjölskyldur, svo það sé auðveldara að vita hvað á að gefa og hvað var gefið síðast.',
  'Afmæli, jól og fermingar koma alltaf aftur, en enginn man hvað var gefið í fyrra, hvað barnið óskaði sér eða hvort einhver annar sé þegar búinn að kaupa sömu gjöf.',
  'Einfalt yfirlit yfir óskir, gjafir og gjafasögu. Fjölskyldan getur séð hvað vantar, hvað er frátekið og hvað þú gafst síðast þegar svipað tilefni kom upp.',
  'Viðburðir', 'idea', 'seed', true
),


(
  'Afmæli og viðburðir',
  'afmaeli-og-vidburdir',
  'Settu inn aldur, áhuga, fjölda gesta og budget og fáðu hugmyndir að viðburði sem passar við tilefnið.',
  'Það getur tekið ótrúlega mikinn tíma að ákveða hvernig afmæli, ferming, fjölskylduboð eða annar viðburður á að vera. Maður endar á að leita út um allt, bera saman hugmyndir og reyna að láta þetta passa við tíma, pening og mannskap.',
  'Einfalt tól þar sem þú setur inn helstu upplýsingar um viðburðinn og færð tillögur að uppsetningu, dagskrá, mat, skrauti, leikjum og innkaupalista. Meira tips og trix en flókið skipulag.',
  'Viðburðir', 'idea', 'seed', true
),


(
  'Allir þessir póstar',
  'allir-thessir-postar',
  'Safnar póstum og skilaboðum frá skóla, Mentor, Abler og tómstundum í eitt einfalt yfirlit.',
  'Foreldrar fá endalausa pósta og tilkynningar. Skólinn sendir eitt, Mentor annað, Abler eitthvað þriðja og svo koma skilaboð frá íþróttum, tónlistarskóla og bekkjarfulltrúum. Það er erfitt að sjá hvað skiptir máli, hvað þarf að gera og hvað má bíða.',
  'Teskeið sem tekur allt þetta inn á einn stað, flokkar það og sýnir hvað þarfnast athygli. Ekki enn eitt pósthólf, heldur einfalt yfirlit yfir það sem tengist börnunum og daglega lífinu.',
  'Börn', 'idea', 'seed', true
),

(
  'Þriðja vaktin',
  'thridja-vaktin',
  'Lausn í mótun fyrir verkefni og ábyrgð sem safnast upp utan hins sýnilega skipulags.',
  'Á mörgum heimilum er fullt af ósýnilegri vinnu sem lendir oft á sama fólkinu. Að muna eftir afmælum, bóka tíma, fylla á það sem vantar, fylgjast með skilaboðum, redda litlu hlutunum og halda utan um allt sem enginn sér fyrr en það klikkar.',
  'Teskeið sem hjálpar heimilinu að gera þessa ósýnilegu ábyrgð sýnilegri. Ekki til að búa til meiri stjórn, heldur til að dreifa álaginu betur og sjá hvað er raunverulega í gangi.',
  'Heimili', 'idea', 'seed', true
),

(
  'Fyrsta vakt krakkanna',
  'fyrsta-vakt-krakkanna',
  'Krakkar safna stigum fyrir heimilisverk og fá sitt fyrsta bragð af ábyrgð, umbun og eigin vakt.',
  'Börn vilja oft hjálpa, en heimilisverk verða fljótt að nöldri, mútum eða einhverju sem gleymist. Foreldrar þurfa að minna á allt og krakkar sjá ekki alltaf tenginguna milli ábyrgðar, þátttöku og umbunar.',
  'Einfalt kerfi þar sem krakkar fá verkefni við hæfi, safna stigum og sjá hvernig þeirra framlag skiptir máli. Fyrsta litla vaktin þeirra, með ábyrgð, hvatningu og umbun sem fjölskyldan getur stillt saman.',
  'Börn', 'idea', 'seed', true
)

ON CONFLICT (slug) DO NOTHING;
