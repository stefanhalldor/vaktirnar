-- Update "Mótavaktin" idea with improved copy focused on parent duty shifts.
-- Idempotent: UPDATE WHERE slug = 'motavaktin' is a no-op if the row does not exist.

UPDATE ideas
SET
  short_description   = 'Heldur utan um sjoppuvaktir, gistivaktir, akstur og önnur foreldrahlutverk í kringum mót og viðburði barna.',
  problem_description = 'Foreldravaktir í kringum mót enda oft í Google Sheets, Messenger þræði og óskýrum skilaboðum. Einhver á að taka sjoppuvakt, annar gistivakt, einhver þarf að keyra eða mæta í uppsetningu, en það er erfitt að sjá hver er búinn að skrá sig og hvað vantar enn.',
  possible_solution   = 'Einfalt vaktayfirlit fyrir foreldrahópinn þar sem hægt er að skrá sig á verkefni, sjá hvaða vaktir eru lausar og fá skýra mynd af því hver gerir hvað. Minna sheets-rugl, færri týnd skilaboð og betri yfirsýn fyrir alla.'
WHERE slug = 'motavaktin';
