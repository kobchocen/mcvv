-- #205: dotazy z kontaktního formuláře (jen nové tabulky, aditivní)
-- CreateTable
CREATE TABLE `mcvv_contact_question` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `message` TEXT NOT NULL,
    `jazyk` VARCHAR(2) NOT NULL DEFAULT 'cs',
    `stav` VARCHAR(10) NOT NULL DEFAULT 'new',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_reply_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `notified_at` DATETIME(3) NULL,

    INDEX `mcvv_contact_question_stav_created_at_idx`(`stav`, `created_at`),
    INDEX `mcvv_contact_question_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_contact_reply` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `question_id` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `author_id` INTEGER NULL,
    `author_name` VARCHAR(80) NOT NULL,
    `mail_queue_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mcvv_contact_reply_question_id_idx`(`question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_contact_reply` ADD CONSTRAINT `mcvv_contact_reply_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `mcvv_contact_question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
