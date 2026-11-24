-- Rychlá nabídka (MD-31): běžci skrytí účtem („už nenabízet“). Migrace jen přidává tabulku,
-- existující tabulky ani data se nemění.

-- CreateTable
CREATE TABLE `mcvv_user_quick_hidden` (
    `user_id` INTEGER NOT NULL,
    `runner_id` CHAR(8) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mcvv_user_quick_hidden_runner_id_idx`(`runner_id`),
    PRIMARY KEY (`user_id`, `runner_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_user_quick_hidden` ADD CONSTRAINT `mcvv_user_quick_hidden_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
