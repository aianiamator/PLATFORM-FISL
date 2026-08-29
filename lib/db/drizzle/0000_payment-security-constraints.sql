UPDATE "payment_requests"
SET "reference" = upper(regexp_replace(trim("reference"), '\s+', ' ', 'g'))
WHERE "reference" IS DISTINCT FROM upper(regexp_replace(trim("reference"), '\s+', ' ', 'g'));
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_requests"
    GROUP BY "reference"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure payment references: normalized duplicate references exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "payment_requests"
    WHERE "status" = 'pending'
    GROUP BY "member_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure pending payments: a member has multiple pending requests';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_reference_unique_idx"
ON "payment_requests" ("reference");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_one_pending_per_member_idx"
ON "payment_requests" ("member_id")
WHERE "status" = 'pending';