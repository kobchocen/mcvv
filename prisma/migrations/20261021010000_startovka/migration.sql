-- Startovka (#114, #115, #116): model startu v ročníku, rozsahy čísel kategorií pro rok,
-- skupiny společného / navazujícího startu a zámek ručně změněných čísel.

-- AlterTable
ALTER TABLE `mcvv_info` ADD COLUMN `st_druhy_od` SMALLINT NOT NULL DEFAULT 601,
    ADD COLUMN `st_nula_s` INTEGER NOT NULL DEFAULT 36900,
    ADD COLUMN `st_obhajce_m` SMALLINT NULL DEFAULT 400,
    ADD COLUMN `st_obhajce_z` SMALLINT NULL DEFAULT 950;

-- CreateTable
CREATE TABLE `mcvv_kateg_rocnik` (
    `rok` SMALLINT NOT NULL,
    `kateg_id` CHAR(1) NOT NULL,
    `cislo_od` SMALLINT NOT NULL,
    `cislo_do` SMALLINT NOT NULL,

    PRIMARY KEY (`rok`, `kateg_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_start_skupina` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rok` SMALLINT NOT NULL,
    `kind` ENUM('joint', 'consecutive') NOT NULL,
    `poznamka` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mcvv_start_skupina_rok_idx`(`rok`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_start_radek` (
    `rok` SMALLINT NOT NULL,
    `bezec_id` CHAR(8) NOT NULL,
    `zamceno` BOOLEAN NOT NULL DEFAULT false,
    `skupina_id` INTEGER NULL,
    `skupina_poradi` SMALLINT NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mcvv_start_radek_skupina_id_idx`(`skupina_id`),
    PRIMARY KEY (`rok`, `bezec_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_start_radek` ADD CONSTRAINT `mcvv_start_radek_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_start_radek` ADD CONSTRAINT `mcvv_start_radek_skupina_id_fkey` FOREIGN KEY (`skupina_id`) REFERENCES `mcvv_start_skupina`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Výchozí rozsahy pro poslední ročník = dosavadní globální rozsahy z číselníku kategorií.
INSERT INTO `mcvv_kateg_rocnik` (`rok`, `kateg_id`, `cislo_od`, `cislo_do`)
SELECT YEAR(i.`datum`), k.`id`, k.`cislo_od`, k.`cislo_do`
FROM `cis_mcvv_kateg` k
CROSS JOIN (SELECT MAX(`datum`) AS `datum` FROM `mcvv_info`) i
WHERE i.`datum` IS NOT NULL;
