-- CreateTable
CREATE TABLE `cis_mcvv_kateg` (
    `id` CHAR(1) NOT NULL,
    `jmeno` VARCHAR(20) NOT NULL,
    `age` SMALLINT NOT NULL,
    `sort` SMALLINT NOT NULL,
    `sex` CHAR(1) NOT NULL,
    `rekord` SMALLINT NOT NULL,
    `startovne` SMALLINT NOT NULL,
    `cislo_od` SMALLINT NOT NULL,
    `cislo_do` SMALLINT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cis_bezec` (
    `id` CHAR(8) NOT NULL,
    `jmeno` VARCHAR(50) NOT NULL,
    `created` DATETIME(3) NULL,
    `autor` VARCHAR(64) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cis_fotka_autor` (
    `id` CHAR(1) NOT NULL,
    `popis` VARCHAR(30) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cis_fotka_kde` (
    `id` CHAR(1) NOT NULL,
    `popis` VARCHAR(20) NOT NULL,
    `sort` SMALLINT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cis_klub` (
    `id` CHAR(3) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `jmeno` VARCHAR(50) NOT NULL,
    `created` DATETIME(3) NULL,
    `autor` VARCHAR(64) NULL,

    PRIMARY KEY (`id`, `rok`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cis_typ_webimages` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `popis` VARCHAR(20) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_info` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `datum` DATE NOT NULL,
    `weather` VARCHAR(64) NULL,
    `temp` SMALLINT NULL,
    `zhl` BOOLEAN NULL DEFAULT true,
    `iscarex` BOOLEAN NULL DEFAULT false,
    `prihl_datum` DATE NULL,
    `prihl_mail` VARCHAR(32) NULL DEFAULT 'mcvv@mcvv.org',
    `start_deti_mail` SMALLINT NULL DEFAULT 20,
    `start_deti_mist` SMALLINT NULL DEFAULT 50,
    `start_dosp_mail` SMALLINT NULL DEFAULT 50,
    `start_dosp_mist` SMALLINT NULL DEFAULT 100,
    `st_interval` SMALLINT NULL DEFAULT 15,
    `infomail` VARCHAR(32) NULL DEFAULT 'mcvv@mcvv.org',
    `infowww` VARCHAR(32) NULL DEFAULT 'www.mcvv.org',
    `infotel` VARCHAR(16) NULL DEFAULT '',
    `fin_dosp_1` SMALLINT NULL DEFAULT 2000,
    `fin_dosp_2` SMALLINT NULL DEFAULT 1000,
    `fin_dosp_3` SMALLINT NULL DEFAULT 500,
    `fin_dosp_4` SMALLINT NULL DEFAULT 200,
    `fin_dosp_5` SMALLINT NULL DEFAULT 100,
    `fin_vet_1` SMALLINT NULL DEFAULT 300,
    `fin_vet_2` SMALLINT NULL DEFAULT 200,
    `fin_vet_3` SMALLINT NULL DEFAULT 100,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_fotky` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rok` SMALLINT NOT NULL,
    `kde_id` CHAR(1) NOT NULL,
    `debug_text` TEXT NULL,
    `created` DATETIME(3) NULL,
    `original_filename` VARCHAR(255) NULL,
    `autor` VARCHAR(8) NULL,
    `image` LONGBLOB NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_bezec_fotka` (
    `fotka_id` INTEGER NOT NULL,
    `bezec_id` CHAR(8) NOT NULL,
    `poradi_zleva` SMALLINT NULL,

    PRIMARY KEY (`fotka_id`, `bezec_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_news` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `datum` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `nadpis` VARCHAR(64) NULL,
    `uvod` MEDIUMTEXT NULL,
    `obsah` TEXT NULL,
    `webimage_id` SMALLINT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webimages` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `typ_id` SMALLINT NOT NULL,
    `bezec_id` CHAR(8) NULL,
    `popis` VARCHAR(128) NOT NULL,
    `rok` SMALLINT NULL,
    `image` LONGBLOB NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_prihlaska` (
    `rok` SMALLINT NOT NULL,
    `id` SMALLINT NOT NULL,
    `email` VARCHAR(128) NULL,
    `typ` CHAR(1) NULL,
    `poznamka` MEDIUMTEXT NULL,
    `created` DATETIME(3) NULL,
    `nazev` VARCHAR(128) NULL,
    `securitycode` VARCHAR(32) NULL,
    `stav` SMALLINT NULL,
    `autor` VARCHAR(64) NULL,
    `promotion` VARCHAR(32) NULL,

    PRIMARY KEY (`rok`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_prihlaska_radek` (
    `bezec_id` CHAR(8) NOT NULL,
    `klub_id` CHAR(3) NOT NULL,
    `kateg_id` CHAR(1) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `cislo` SMALLINT NULL,
    `prihlaska_id` SMALLINT NOT NULL,
    `startovne` SMALLINT NULL,
    `poznamka` VARCHAR(128) NULL,
    `created` DATETIME(3) NULL,
    `autor` VARCHAR(64) NULL,

    PRIMARY KEY (`rok`, `bezec_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_platba` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rok` SMALLINT NOT NULL DEFAULT 2018,
    `prihlaska_id` CHAR(3) NOT NULL,
    `datum` DATE NULL,
    `castka` SMALLINT NULL,
    `created` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `autor` VARCHAR(8) NULL DEFAULT 'admin',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_start` (
    `bezec_id` CHAR(8) NOT NULL,
    `klub_id` CHAR(3) NOT NULL,
    `kateg_id` CHAR(1) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `cislo` SMALLINT NOT NULL,
    `bezec_name` VARCHAR(50) NULL,
    `klub_name` VARCHAR(50) NULL,

    PRIMARY KEY (`rok`, `bezec_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_time` (
    `bezec_id` CHAR(8) NOT NULL,
    `rok` SMALLINT NOT NULL,
    `klub_id` CHAR(3) NOT NULL,
    `kateg_id` CHAR(1) NOT NULL,
    `time` SMALLINT NOT NULL,
    `bezec_name` VARCHAR(50) NULL,
    `klub_name` VARCHAR(50) NULL,

    PRIMARY KEY (`rok`, `bezec_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_split` (
    `cislo` SMALLINT NOT NULL,
    `rok` SMALLINT NOT NULL,
    `split` CHAR(1) NOT NULL,
    `time` SMALLINT NOT NULL,
    `created` DATETIME(3) NULL,
    `autor` VARCHAR(8) NULL,

    PRIMARY KEY (`cislo`, `rok`, `split`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `a_user` VARCHAR(8) NOT NULL,
    `a_passwd` VARCHAR(8) NULL,

    PRIMARY KEY (`a_user`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsors` (
    `id` SMALLINT NOT NULL AUTO_INCREMENT,
    `nazev` VARCHAR(128) NULL,
    `link` VARCHAR(128) NULL,
    `image` VARCHAR(64) NULL,
    `category` SMALLINT NOT NULL,
    `poradi` SMALLINT NOT NULL,
    `active` BOOLEAN NULL,
    `description` VARCHAR(1024) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_fotky` ADD CONSTRAINT `mcvv_fotky_kde_id_fkey` FOREIGN KEY (`kde_id`) REFERENCES `cis_fotka_kde`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_bezec_fotka` ADD CONSTRAINT `mcvv_bezec_fotka_fotka_id_fkey` FOREIGN KEY (`fotka_id`) REFERENCES `mcvv_fotky`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_bezec_fotka` ADD CONSTRAINT `mcvv_bezec_fotka_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_news` ADD CONSTRAINT `mcvv_news_webimage_id_fkey` FOREIGN KEY (`webimage_id`) REFERENCES `webimages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webimages` ADD CONSTRAINT `webimages_typ_id_fkey` FOREIGN KEY (`typ_id`) REFERENCES `cis_typ_webimages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `webimages` ADD CONSTRAINT `webimages_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_prihlaska_radek` ADD CONSTRAINT `mcvv_prihlaska_radek_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_prihlaska_radek` ADD CONSTRAINT `mcvv_prihlaska_radek_klub_id_rok_fkey` FOREIGN KEY (`klub_id`, `rok`) REFERENCES `cis_klub`(`id`, `rok`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_prihlaska_radek` ADD CONSTRAINT `mcvv_prihlaska_radek_kateg_id_fkey` FOREIGN KEY (`kateg_id`) REFERENCES `cis_mcvv_kateg`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_prihlaska_radek` ADD CONSTRAINT `mcvv_prihlaska_radek_rok_prihlaska_id_fkey` FOREIGN KEY (`rok`, `prihlaska_id`) REFERENCES `mcvv_prihlaska`(`rok`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_start` ADD CONSTRAINT `mcvv_start_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_start` ADD CONSTRAINT `mcvv_start_klub_id_rok_fkey` FOREIGN KEY (`klub_id`, `rok`) REFERENCES `cis_klub`(`id`, `rok`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_start` ADD CONSTRAINT `mcvv_start_kateg_id_fkey` FOREIGN KEY (`kateg_id`) REFERENCES `cis_mcvv_kateg`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_time` ADD CONSTRAINT `mcvv_time_bezec_id_fkey` FOREIGN KEY (`bezec_id`) REFERENCES `cis_bezec`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_time` ADD CONSTRAINT `mcvv_time_klub_id_rok_fkey` FOREIGN KEY (`klub_id`, `rok`) REFERENCES `cis_klub`(`id`, `rok`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_time` ADD CONSTRAINT `mcvv_time_kateg_id_fkey` FOREIGN KEY (`kateg_id`) REFERENCES `cis_mcvv_kateg`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
