UPDATE "payment_requests"
SET "reference" = upper(regexp_replace(
  regexp_replace(trim("reference"), '[[:cntrl:]]', '', 'g'),
  '\s+',
  ' ',
  'g'
))
WHERE "reference" IS DISTINCT FROM upper(regexp_replace(
  regexp_replace(trim("reference"), '[[:cntrl:]]', '', 'g'),
  '\s+',
  ' ',
  'g'
));