-- Add "Allir þessir póstar" idea.
-- Uses ON CONFLICT DO UPDATE so copy corrections can be applied by re-running this file.

INSERT INTO ideas (title, slug, short_description, problem_description, possible_solution, category, status, source, is_public)
VALUES (
  'Allir þessir póstar',
  'allir-thessir-postar',
  'Safnar póstum og skilaboðum frá skóla, Mentor, Abler og tómstundum í eitt einfalt yfirlit.',
  'Foreldrar fá endalausa pósta og tilkynningar. Skólinn sendir eitt, Mentor annað, Abler eitthvað þriðja og svo koma skilaboð frá íþróttum, tónlistarskóla og bekkjarfulltrúum. Það er erfitt að sjá hvað skiptir máli, hvað þarf að gera og hvað má bíða.',
  'Teskeið sem tekur allt þetta inn á einn stað, flokkar það og sýnir hvað þarfnast athygli. Ekki enn eitt pósthólf, heldur einfalt yfirlit yfir það sem tengist börnunum og daglega lífinu.',
  'Börn', 'idea', 'seed', true
)
ON CONFLICT (slug) DO UPDATE SET
  title               = EXCLUDED.title,
  short_description   = EXCLUDED.short_description,
  problem_description = EXCLUDED.problem_description,
  possible_solution   = EXCLUDED.possible_solution,
  category            = EXCLUDED.category;
