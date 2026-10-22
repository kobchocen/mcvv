-- Identita klubu = cis_klub.id (#104, Q34). Navazuje na 20261022010000_canonical_clubs.
--
-- 1) Id klubu char(3) -> varchar(8) ve všech tabulkách, kde se vyskytuje (cis_klub,
--    mcvv_prihlaska_radek, mcvv_start, mcvv_time), aby číselná id pokračovala nad 999 bez
--    přetečení. Hodnoty se nemění (char se čte bez koncových mezer, dnešní id mají 1–3 znaky),
--    řazení podle id ani export do OBD se nemění.
--    Sloupce ve vazbě cizího klíče nejde změnit (chyba 1833), proto se klíče na dobu změny
--    zruší a pak se stejně pojmenované vytvoří znovu. Legacy data obsahují pár řádků mcvv_start
--    bez odpovídajícího cis_klub (importováno bez kontroly), proto se klíče přidávají bez
--    ověření existujících řádků (FOREIGN_KEY_CHECKS = 0), stejně jako dosud, data se nemění.
--    ALGORITHM=COPY: MariaDB při INPLACE s vypnutými kontrolami uloží ON DELETE RESTRICT jako
--    NO ACTION (chování stejné, ale Prisma to hlásí jako drift), COPY uloží RESTRICT
--    v MariaDB i MySQL 8.4.

--    sql_mode bez NO_ZERO_DATE/NO_ZERO_IN_DATE jen po dobu přestavby tabulek: legacy řádky
--    mají `created` = '0000-00-00 00:00:00' a MySQL 8.4 (výchozí sql_mode) by je při kopii
--    tabulky odmítl (chyba 1292). Hodnoty zůstávají, jak jsou, režim se na konci vrátí.
SET @MCVV_OLD_SQL_MODE = @@SESSION.sql_mode;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- DropForeignKey
ALTER TABLE `mcvv_prihlaska_radek` DROP FOREIGN KEY `mcvv_prihlaska_radek_klub_id_rok_fkey`;

-- DropForeignKey
ALTER TABLE `mcvv_start` DROP FOREIGN KEY `mcvv_start_klub_id_rok_fkey`;

-- DropForeignKey
ALTER TABLE `mcvv_time` DROP FOREIGN KEY `mcvv_time_klub_id_rok_fkey`;

-- DropIndex
DROP INDEX `mcvv_prihlaska_radek_klub_id_rok_fkey` ON `mcvv_prihlaska_radek`;

-- DropIndex
DROP INDEX `mcvv_start_klub_id_rok_fkey` ON `mcvv_start`;

-- DropIndex
DROP INDEX `mcvv_time_klub_id_rok_fkey` ON `mcvv_time`;

-- AlterTable
ALTER TABLE `cis_klub` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(8) NOT NULL,
    ADD PRIMARY KEY (`id`, `rok`);

-- AlterTable
ALTER TABLE `mcvv_prihlaska_radek` MODIFY `klub_id` VARCHAR(8) NOT NULL;

-- AlterTable
ALTER TABLE `mcvv_start` MODIFY `klub_id` VARCHAR(8) NOT NULL;

-- AlterTable
ALTER TABLE `mcvv_time` MODIFY `klub_id` VARCHAR(8) NOT NULL;

SET FOREIGN_KEY_CHECKS = 0;

-- AddForeignKey
ALTER TABLE `mcvv_prihlaska_radek` ALGORITHM=COPY, ADD CONSTRAINT `mcvv_prihlaska_radek_klub_id_rok_fkey` FOREIGN KEY (`klub_id`, `rok`) REFERENCES `cis_klub`(`id`, `rok`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_start` ALGORITHM=COPY, ADD CONSTRAINT `mcvv_start_klub_id_rok_fkey` FOREIGN KEY (`klub_id`, `rok`) REFERENCES `cis_klub`(`id`, `rok`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_time` ALGORITHM=COPY, ADD CONSTRAINT `mcvv_time_klub_id_rok_fkey` FOREIGN KEY (`klub_id`, `rok`) REFERENCES `cis_klub`(`id`, `rok`) ON DELETE RESTRICT ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;

SET SESSION sql_mode = @MCVV_OLD_SQL_MODE;

-- 2) Sloučení podle názvů (mcvv_klub + mcvv_klub_alias, klíč = normalizovaný název) nahrazuje
--    ruční sloučení podle id. Aliasy názvů nejdou jednoznačně převést na id (jeden název má
--    i víc id), proto se tabulky ruší, byly jen na develop/staging, ne na produkci.
--    Legacy tabulky se nemění.

-- DropForeignKey
ALTER TABLE `mcvv_klub_alias` DROP FOREIGN KEY `mcvv_klub_alias_klub_id_fkey`;

-- DropTable
DROP TABLE `mcvv_klub_alias`;

-- DropTable
DROP TABLE `mcvv_klub`;

-- DropTable
DROP TABLE `mcvv_klub_navrh_zamitnuty`;

-- CreateTable
CREATE TABLE `mcvv_klub_slouceni` (
    `klub_id` VARCHAR(8) NOT NULL,
    `hlavni_klub_id` VARCHAR(8) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `author` VARCHAR(255) NULL,

    INDEX `mcvv_klub_slouceni_hlavni_klub_id_idx`(`hlavni_klub_id`),
    PRIMARY KEY (`klub_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_klub_navrh_zamitnuty` (
    `klub_id_a` VARCHAR(8) NOT NULL,
    `klub_id_b` VARCHAR(8) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `author` VARCHAR(255) NULL,

    PRIMARY KEY (`klub_id_a`, `klub_id_b`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
