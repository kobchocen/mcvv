-- Termíny přihlášek a startovné (sloty, fáze 1 – část 1).
-- Jen nové tabulky a nové sloupce s výchozími hodnotami; legacy data se nemění.
-- Seed ročníku 2026 odpovídá dnešnímu chování (standard = ceny z číselníku kategorií,
-- konec standardu = konec dne uzávěrky prihl_datum), pozdní přihlášky zatím neaktivní.
-- Časy DATETIME jsou v UTC (Praha v prosinci = UTC+1).
-- AlterTable
ALTER TABLE `mcvv_info` ADD COLUMN `doplatek_std_do` DATETIME(3) NULL,
    ADD COLUMN `doplatek_std_mail` INTEGER NOT NULL DEFAULT 25200,
    ADD COLUMN `kancelar_od` INTEGER NOT NULL DEFAULT 32400,
    ADD COLUMN `na_miste_do` INTEGER NOT NULL DEFAULT 35100,
    ADD COLUMN `prihl_otevreni` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `mcvv_prihlaska_meta` ADD COLUMN `auto_zruseno_at` DATETIME(3) NULL,
    ADD COLUMN `doplatek_mail_at` DATETIME(3) NULL,
    ADD COLUMN `slot` ENUM('early', 'standard', 'late', 'onsite') NULL;

-- CreateTable
CREATE TABLE `mcvv_prihl_slot` (
    `rok` SMALLINT NOT NULL,
    `typ` ENUM('early', 'standard', 'late', 'onsite') NOT NULL,
    `od` DATETIME(3) NOT NULL,
    `do` DATETIME(3) NOT NULL,
    `aktivni` BOOLEAN NOT NULL DEFAULT true,
    `cena_dospeli` SMALLINT NOT NULL,
    `cena_mladez` SMALLINT NOT NULL,
    `platba_min` SMALLINT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`rok`, `typ`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_kateg_meta` (
    `kateg_id` CHAR(1) NOT NULL,
    `skupina` ENUM('dospeli', 'mladez') NOT NULL DEFAULT 'dospeli',

    PRIMARY KEY (`kateg_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Skupina startovného kategorií: mládež = žactvo + dorost (kategorie s věkovou hranicí pod 20).
INSERT IGNORE INTO `mcvv_kateg_meta` (`kateg_id`, `skupina`)
SELECT `id`, IF(`age` > 0 AND `age` < 20, 'mladez', 'dospeli') FROM `cis_mcvv_kateg`;

-- Seed 2026 (ročník se závodem v roce 2026, jen pokud existuje).
-- Standard: od nejstarší přihlášky 2026 (nejpozději 1. 9.), do = den po uzávěrce 00:00 Praha.
INSERT IGNORE INTO `mcvv_prihl_slot` (`rok`, `typ`, `od`, `do`, `aktivni`, `cena_dospeli`, `cena_mladez`, `platba_min`)
SELECT 2026, 'standard',
  COALESCE(LEAST((SELECT MIN(`created`) FROM `mcvv_prihlaska` WHERE `rok` = 2026), '2026-09-01 00:00:00'), '2026-09-01 00:00:00'),
  TIMESTAMP(COALESCE(i.`prihl_datum`, '2026-12-02'), '23:00:00'),
  TRUE,
  COALESCE((SELECT MAX(`startovne`) FROM `cis_mcvv_kateg` WHERE NOT (`age` > 0 AND `age` < 20)), i.`start_dosp_mail`, 100),
  COALESCE((SELECT MAX(`startovne`) FROM `cis_mcvv_kateg` WHERE `age` > 0 AND `age` < 20), i.`start_deti_mail`, 50),
  NULL
FROM `mcvv_info` i WHERE YEAR(i.`datum`) = 2026 ORDER BY i.`id` DESC LIMIT 1;

-- Early: letos ne (neaktivní, nulová délka).
INSERT IGNORE INTO `mcvv_prihl_slot` (`rok`, `typ`, `od`, `do`, `aktivni`, `cena_dospeli`, `cena_mladez`, `platba_min`)
SELECT 2026, 'early', s.`od`, s.`od`, FALSE, s.`cena_dospeli`, s.`cena_mladez`, NULL
FROM `mcvv_prihl_slot` s WHERE s.`rok` = 2026 AND s.`typ` = 'standard';

-- Late: od konce standardu do dne před závodem 18:00 Praha; 200 / 100 Kč (Q299), lhůta 60 min.
-- Zatím NEaktivní – zapne se v administraci s nasazením pozdních přihlášek (část 2).
INSERT IGNORE INTO `mcvv_prihl_slot` (`rok`, `typ`, `od`, `do`, `aktivni`, `cena_dospeli`, `cena_mladez`, `platba_min`)
SELECT 2026, 'late', s.`do`, TIMESTAMP(DATE_SUB(i.`datum`, INTERVAL 1 DAY), '17:00:00'), FALSE, 200, 100, 60
FROM `mcvv_prihl_slot` s JOIN `mcvv_info` i ON YEAR(i.`datum`) = 2026
WHERE s.`rok` = 2026 AND s.`typ` = 'standard' ORDER BY i.`id` DESC LIMIT 1;

-- Na místě: den závodu od otevření závodní kanceláře (9:00) do konce přihlášek na místě (9:45).
INSERT IGNORE INTO `mcvv_prihl_slot` (`rok`, `typ`, `od`, `do`, `aktivni`, `cena_dospeli`, `cena_mladez`, `platba_min`)
SELECT 2026, 'onsite', TIMESTAMP(i.`datum`, '08:00:00'), TIMESTAMP(i.`datum`, '08:45:00'), TRUE,
  COALESCE(i.`start_dosp_mist`, 200), COALESCE(i.`start_deti_mist`, 100), NULL
FROM `mcvv_info` i WHERE YEAR(i.`datum`) = 2026 ORDER BY i.`id` DESC LIMIT 1;

-- Nastavení ročníku 2026: otevření = začátek standardu, doplatek do čt 3. 12. 12:00 Praha.
UPDATE `mcvv_info` i JOIN `mcvv_prihl_slot` s ON s.`rok` = 2026 AND s.`typ` = 'standard'
SET i.`prihl_otevreni` = s.`od`,
    i.`doplatek_std_do` = TIMESTAMP(DATE(s.`do` + INTERVAL 1 HOUR), '11:00:00')
WHERE YEAR(i.`datum`) = 2026;
