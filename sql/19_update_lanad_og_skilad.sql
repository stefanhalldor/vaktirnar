-- Update "Lánað og skilað" copy
-- Idempotent: safe to re-run

UPDATE ideas
SET
  short_description = 'Haltu utan um hluti sem þú hefur lánað eða fengið að láni, án þess að þurfa að muna þetta sjálf/ur.',
  problem_description = 'Bækur, verkfæri, barnadót, föt, hleðslutæki og allt hitt sem fer á milli fólks hverfur oft bara inn í hversdaginn. Svo man enginn alveg hver fékk hvað, hvenær það átti að skila því eða hvort það sé vandræðalegt að minna á það.',
  possible_solution = 'Einfalt yfirlit yfir hluti sem þú hefur lánað eða fengið að láni. Skráðu hlutinn, manneskjuna og skiladag ef hann er til. Teskeið getur sent áminningu þegar tími er kominn til að skila eða biðja fallega um að fá hlutinn aftur.',
  updated_at = now()
WHERE slug = 'lanad-og-skilad';
