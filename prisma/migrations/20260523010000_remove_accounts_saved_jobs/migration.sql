-- Accounts + saved-jobs feature removed (moved to the separate ApplyPilot
-- product). Tables were added in 20260523000000_add_accounts_saved_jobs and
-- carried no production data. Drop in FK-dependency order.

-- DropTable
DROP TABLE IF EXISTS "saved_jobs";

-- DropTable
DROP TABLE IF EXISTS "sessions";

-- DropTable
DROP TABLE IF EXISTS "login_tokens";

-- DropTable
DROP TABLE IF EXISTS "users";
