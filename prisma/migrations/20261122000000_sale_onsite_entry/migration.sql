-- #222 Dohláška na místě: prodejka v pokladně zakládá přihlášku. Vazba prodejka → přihláška
-- (rok prodejky + prihlaska_id). Jen aditivní nullable sloupec a index.
-- AlterTable
ALTER TABLE `mcvv_sale` ADD COLUMN `prihlaska_id` SMALLINT NULL;

-- CreateIndex
CREATE INDEX `mcvv_sale_rok_prihlaska_id_idx` ON `mcvv_sale`(`rok`, `prihlaska_id`);
