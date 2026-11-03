-- Pozdní přihlášky (late): čas odeslání a lhůta na zaplacení (odeslání + 60 min).
-- Jen nové nullable sloupce v tabulce mcvv_prihlaska_meta; legacy tabulky se nemění.
-- AlterTable
ALTER TABLE `mcvv_prihlaska_meta` ADD COLUMN `odeslano_at` DATETIME(3) NULL,
    ADD COLUMN `platba_do` DATETIME(3) NULL;
