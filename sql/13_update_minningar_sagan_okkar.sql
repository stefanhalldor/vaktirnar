-- Rename "Minningar" → "Sagan okkar" and update all copy.
-- Handles both cases: slug still 'minningar' or already renamed to 'sagan-okkar'.

-- Case 1: row exists as 'minningar' — rename and update
UPDATE ideas
SET
  title               = 'Sagan okkar',
  slug                = 'sagan-okkar',
  short_description   = 'Lifandi lífssaga sem byggist upp smátt og smátt, með sögum, myndum, stöðum og augnablikum úr lífinu.',
  problem_description = 'Minningar týnast auðveldlega í símanum, á Facebook, í gömlum tölvum og í höfðinu á fólki. Svo kemur seinna að einhver vill vita hvernig húsið leit út, hvaða lag var alltaf spilað, hvernig þið kynntust eða hvað barnið sagði einu sinni sem allir hlógu að.',
  possible_solution   = 'Sagan okkar er hugmynd að lifandi ævisögu sem byrjar snemma og vex með manneskjunni. Ekki þung bók sem er skrifuð eftir á, heldur litlar færslur yfir tíma, ein saga, ein mynd, einn staður, eitt augnablik. Drög að verkefninu eru á saganokkar.is, en það gæti vel endað sem ein af teskeiðunum inni í Teskeið.'
WHERE slug = 'minningar';

-- Case 2: row already renamed — update copy only
UPDATE ideas
SET
  short_description   = 'Lifandi lífssaga sem byggist upp smátt og smátt, með sögum, myndum, stöðum og augnablikum úr lífinu.',
  problem_description = 'Minningar týnast auðveldlega í símanum, á Facebook, í gömlum tölvum og í höfðinu á fólki. Svo kemur seinna að einhver vill vita hvernig húsið leit út, hvaða lag var alltaf spilað, hvernig þið kynntust eða hvað barnið sagði einu sinni sem allir hlógu að.',
  possible_solution   = 'Sagan okkar er hugmynd að lifandi ævisögu sem byrjar snemma og vex með manneskjunni. Ekki þung bók sem er skrifuð eftir á, heldur litlar færslur yfir tíma, ein saga, ein mynd, einn staður, eitt augnablik. Drög að verkefninu eru á saganokkar.is, en það gæti vel endað sem ein af teskeiðunum inni í Teskeið.'
WHERE slug = 'sagan-okkar';
