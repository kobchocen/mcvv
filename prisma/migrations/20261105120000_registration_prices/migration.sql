-- Startovné uložené u přihlášky (Q342): cena dospělí / mládež z termínu v okamžiku založení.
-- Jen nové nullable sloupce v tabulce mcvv_prihlaska_meta; legacy tabulky se nemění.
-- AlterTable
ALTER TABLE `mcvv_prihlaska_meta` ADD COLUMN `cena_dospeli` SMALLINT NULL,
    ADD COLUMN `cena_mladez` SMALLINT NULL;

-- Ročníky s termíny: přihlášky bez záznamu v meta = standard (záznam se doplní).
INSERT IGNORE INTO `mcvv_prihlaska_meta` (`rok`, `id`)
SELECT p.`rok`, p.`id` FROM `mcvv_prihlaska` p
WHERE EXISTS (SELECT 1 FROM `mcvv_prihl_slot` s WHERE s.`rok` = p.`rok`);

-- Uložit dnešní cenu termínu, ve kterém přihláška vznikla (bez termínu = standard).
UPDATE `mcvv_prihlaska_meta` m
JOIN `mcvv_prihl_slot` s ON s.`rok` = m.`rok` AND s.`typ` = COALESCE(m.`slot`, 'standard')
SET m.`cena_dospeli` = s.`cena_dospeli`, m.`cena_mladez` = s.`cena_mladez`
WHERE m.`cena_dospeli` IS NULL AND m.`cena_mladez` IS NULL;
