-- Newsletter: volba vyřadit letos přihlášené (výchozí zapnuto, i pro existující koncepty).

-- AlterTable
ALTER TABLE `mcvv_newsletter` ADD COLUMN `exclude_current_entrants` BOOLEAN NOT NULL DEFAULT true;
