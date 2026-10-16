-- Výkon fotogalerie: příznak has_image + rozměry + index (rok, has_image).
-- ADD COLUMN bez ALGORITHM klauzule: MySQL 8.0.12+ i MariaDB 10.3+ zvolí INSTANT
-- (bez přestavby 1.9 GB tabulky). Explicitní INPLACE by na MySQL 8 tabulku přestavěl.
ALTER TABLE `mcvv_fotky`
  ADD COLUMN `has_image` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `width` INTEGER NULL,
  ADD COLUMN `height` INTEGER NULL;

-- Backfill po dávkách podle PK (krátké transakce/zámky). Celkem jeden průchod blobů (~1.9 GB).
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 0 AND `id` < 1000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 1000 AND `id` < 2000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 2000 AND `id` < 3000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 3000 AND `id` < 4000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 4000 AND `id` < 5000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 5000 AND `id` < 6000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 6000 AND `id` < 7000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 7000 AND `id` < 8000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 8000 AND `id` < 9000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 9000 AND `id` < 10000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 10000 AND `id` < 11000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 11000 AND `id` < 12000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 12000 AND `id` < 13000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 13000 AND `id` < 14000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 14000 AND `id` < 15000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 15000 AND `id` < 16000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 16000 AND `id` < 17000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 17000 AND `id` < 18000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 18000 AND `id` < 19000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 19000 AND `id` < 20000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 20000 AND `id` < 21000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 21000 AND `id` < 22000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 22000 AND `id` < 23000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 23000 AND `id` < 24000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 24000 AND `id` < 25000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 25000 AND `id` < 26000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 26000 AND `id` < 27000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 27000 AND `id` < 28000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 28000 AND `id` < 29000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 29000 AND `id` < 30000;
UPDATE `mcvv_fotky` SET `has_image` = (`image` IS NOT NULL) WHERE `id` >= 30000;

-- Online index build (bez blokace zápisů).
CREATE INDEX `mcvv_fotky_rok_has_image_idx` ON `mcvv_fotky`(`rok`, `has_image`) ALGORITHM=INPLACE LOCK=NONE;
