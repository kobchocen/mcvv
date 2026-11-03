-- Platby na automaticky zrušené přihlášky: vrácení se eviduje u přihlášky (nullable, bez zámků dat).
-- AlterTable
ALTER TABLE `mcvv_prihlaska_meta` ADD COLUMN `vraceno_at` DATETIME(3) NULL;
