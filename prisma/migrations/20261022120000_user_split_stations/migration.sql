-- Přiřazení splitmakera ke stanovišti (kódy splitů, např. "1" nebo "13"). NULL = bez přiřazení:
-- splitmaker bez stanoviště nezapisuje nic. Admin a organizer zapisují dál na všechna stanoviště.
-- AlterTable
ALTER TABLE `mcvv_user` ADD COLUMN `split_stations` VARCHAR(8) NULL;
