-- AlterTable
ALTER TABLE `mcvv_user` ADD COLUMN `email_verified` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `mcvv_email_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcvv_email_token_token_hash_key` (`token_hash`),
    INDEX `mcvv_email_token_user_id_idx` (`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_email_token` ADD CONSTRAINT `mcvv_email_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
