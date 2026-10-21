-- Nové omezené role (#112, #117): timing („Časomíra“, externí dodavatel OBD) a splitmaker
-- (obsluha mezičasových kontrol). Přidání hodnot na konec ENUM nemění existující řádky.
-- Auditní tabulka akcí v administraci (#107): změny rolí, exporty a importy dne závodu.
-- AlterTable
ALTER TABLE `mcvv_user` MODIFY `role` ENUM('registrar', 'organizer', 'admin', 'timing', 'splitmaker') NOT NULL;

-- CreateTable
CREATE TABLE `mcvv_audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor_user_id` INTEGER NULL,
    `actor_email` VARCHAR(255) NOT NULL,
    `actor_role` VARCHAR(20) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `target` VARCHAR(128) NULL,
    `detail` JSON NULL,

    INDEX `mcvv_audit_log_action_created_at_idx`(`action`, `created_at`),
    INDEX `mcvv_audit_log_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_audit_log` ADD CONSTRAINT `mcvv_audit_log_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

