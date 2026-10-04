BEGIN;
-- Normalize existing addresses. Uniqueness collisions roll back the transaction.
UPDATE "User" SET "email" = lower(trim("email"));
COMMIT;
