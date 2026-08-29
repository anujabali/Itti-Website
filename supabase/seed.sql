-- Ailment taxonomy — PLACEHOLDER.
--
-- This is a scaffold so the form renders and the flow can be tested end to end.
-- It is NOT a clinical taxonomy and must not launch as one. Open question #3 in
-- docs/APP-DECISIONS.md: someone clinical has to review and replace this list,
-- because these codes become the spine of every analysis afterwards and
-- renaming them later rewrites history.
--
-- The 'other' member of each pillar is the escape hatch. Answers that land in
-- health_intake.ailment_other are reviewed monthly, and real ones are promoted
-- into this table.

insert into ailment (code, pillar, label_en, sort_order) values
  ('nd_autism',        'neurodivergence', 'Autism',                     10),
  ('nd_adhd',          'neurodivergence', 'ADHD',                       20),
  ('nd_dyslexia',      'neurodivergence', 'Dyslexia',                   30),
  ('nd_learning',      'neurodivergence', 'Other learning difference',  40),
  ('nd_undiagnosed',   'neurodivergence', 'Suspected, not yet assessed',50),
  ('nd_other',         'neurodivergence', 'Something else',            900),

  ('cc_breast',        'cancer_care',     'Breast cancer',              10),
  ('cc_cervical',      'cancer_care',     'Cervical cancer',            20),
  ('cc_oral',          'cancer_care',     'Oral cancer',                30),
  ('cc_lung',          'cancer_care',     'Lung cancer',                40),
  ('cc_colorectal',    'cancer_care',     'Colorectal cancer',          50),
  ('cc_blood',         'cancer_care',     'Blood cancer',               60),
  ('cc_undiagnosed',   'cancer_care',     'Under investigation',        70),
  ('cc_other',         'cancer_care',     'Another cancer',            900),

  ('other_none',       'other',           'None — I am here to support',10),
  ('other_other',      'other',           'Something else',            900)
on conflict (code) do nothing;
