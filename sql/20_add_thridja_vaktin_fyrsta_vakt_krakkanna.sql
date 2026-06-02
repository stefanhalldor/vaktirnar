-- Add "Þriðja vaktin" and "Fyrsta vakt krakkanna"
-- Idempotent: ON CONFLICT (slug) DO UPDATE so copy can be corrected on re-run

INSERT INTO ideas (title, slug, short_description, problem_description, possible_solution, category, status, source, is_public)
VALUES

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

ON CONFLICT (slug) DO UPDATE SET
  title              = EXCLUDED.title,
  short_description  = EXCLUDED.short_description,
  problem_description = EXCLUDED.problem_description,
  possible_solution  = EXCLUDED.possible_solution,
  category           = EXCLUDED.category,
  updated_at         = now();
