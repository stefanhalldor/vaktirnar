-- Update "Umönnun" idea with final copy framing.
-- Idempotent: UPDATE WHERE slug = 'umonnun' is a no-op if the row does not exist.

UPDATE ideas
SET
  status              = 'launched',
  short_description   = 'Umönnun er nú þegar til á umonnun.is. Hún tekur eitt mikilvægt atriði úr öllu hinu og setur það á einfaldan stað.',
  problem_description = 'Þegar einhver sem þér þykir vænt um þarf aðstoð ætti utanumhaldið ekki að týnast í Messenger, fjölskylduspjalli, minnismiðum og minni hvers og eins. En það gerist alltof oft. Skilaboð dreifast, ábyrgðin verður óljós og hlutir detta á milli, ekki vegna þess að engum sé ekki sama, heldur vegna þess að það vantar einn einfaldan stað til að vera samstíga.',
  possible_solution   = 'Umönnun er tilbúin lausn fyrir umönnunarhringi, ættingja, vini og nágranna sem þurfa að láta hlutina ganga upp saman. Hún hjálpar fólki að sjá hver kemur hvenær, hvað hefur verið gert og hverju gleymdist að segja frá. Hún er afmörkuð teskeiðarútfærsla, eitt mikilvægt atriði tekið út úr öllu hinu til að einfalda lífið aðeins. Umönnunarappið er hægt að sækja í App Store og Play Store, og þegar fram líða stundir gæti hún best átt heima inni í Teskeið.'
WHERE slug = 'umonnun';
