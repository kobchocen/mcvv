-- Návrh administrace v2 (P3): víc rolí na účet, odchylky matice oprávnění, vlastní připnuté
-- položky a doplňkové údaje auditu. Migrace jen přidává tabulky, existující tabulky se nemění.
-- Nic z toho se nečte, dokud admin nezapne nastavení `permissions.v2` (výchozí vypnuto).

-- CreateTable
CREATE TABLE `mcvv_user_role` (
    `user_id` INTEGER NOT NULL,
    `role` VARCHAR(24) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NULL,

    INDEX `mcvv_user_role_role_idx`(`role`),
    PRIMARY KEY (`user_id`, `role`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_role_section` (
    `role` VARCHAR(24) NOT NULL,
    `section_id` VARCHAR(48) NOT NULL,
    `level` VARCHAR(5) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_by` INTEGER NULL,

    PRIMARY KEY (`role`, `section_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_user_pin` (
    `user_id` INTEGER NOT NULL,
    `section_id` VARCHAR(48) NOT NULL,
    `pos` TINYINT NOT NULL,

    PRIMARY KEY (`user_id`, `section_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_audit_meta` (
    `audit_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `year` SMALLINT NULL,
    `bib` SMALLINT NULL,
    `entity` VARCHAR(24) NULL,
    `source` VARCHAR(8) NULL,
    `actor_roles` VARCHAR(160) NULL,
    `request_id` CHAR(16) NULL,

    INDEX `mcvv_audit_meta_year_bib_created_at_idx`(`year`, `bib`, `created_at`),
    INDEX `mcvv_audit_meta_entity_created_at_idx`(`entity`, `created_at`),
    PRIMARY KEY (`audit_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_user_role` ADD CONSTRAINT `mcvv_user_role_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_user_pin` ADD CONSTRAINT `mcvv_user_pin_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_audit_meta` ADD CONSTRAINT `mcvv_audit_meta_audit_id_fkey` FOREIGN KEY (`audit_id`) REFERENCES `mcvv_audit_log`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Převod dnešních rolí (idempotentní, opakované spuštění nic nepřidá):
-- organizer → přechodná role „Pořadatel (přechodná)“ s přesně dnešním přístupem pořadatele,
-- timing → Měření, ostatní role beze změny kódu. Závodník (registrar) se nezapisuje.
-- Sloupec `mcvv_user.role` zůstává jako záloha a dokud je flag vypnutý, rozhoduje dál on.
INSERT IGNORE INTO `mcvv_user_role` (`user_id`, `role`, `created_at`)
SELECT `id`,
       CASE `role`
         WHEN 'organizer' THEN 'organizer_legacy'
         WHEN 'timing' THEN 'timing_ops'
         ELSE `role`
       END,
       CURRENT_TIMESTAMP(3)
FROM `mcvv_user`
WHERE `role` <> 'registrar';
