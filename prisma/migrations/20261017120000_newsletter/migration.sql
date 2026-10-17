-- Newsletter: jen nové (prázdné) tabulky, žádný zásah do existujících velkých tabulek.
-- FK na mcvv_user (malá tabulka) jen krátký metadata lock.

-- CreateTable
CREATE TABLE `mcvv_newsletter` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('draft', 'test_sent', 'sending', 'sent') NOT NULL DEFAULT 'draft',
    `audience_users` BOOLEAN NOT NULL DEFAULT true,
    `audience_years` SMALLINT NOT NULL DEFAULT 0,
    `created_by_id` INTEGER NULL,
    `test_sent_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mcvv_newsletter_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_newsletter_recipient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `status` ENUM('pending', 'sending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
    `error` VARCHAR(500) NULL,
    `claim_token` VARCHAR(36) NULL,
    `claimed_at` DATETIME(3) NULL,
    `provider_id` VARCHAR(64) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mcvv_newsletter_recipient_campaign_id_status_idx`(`campaign_id`, `status`),
    INDEX `mcvv_newsletter_recipient_claim_token_idx`(`claim_token`),
    UNIQUE INDEX `mcvv_newsletter_recipient_campaign_id_email_key`(`campaign_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_newsletter_optout` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `unsubscribed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcvv_newsletter_optout_email_key`(`email`),
    UNIQUE INDEX `mcvv_newsletter_optout_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_newsletter` ADD CONSTRAINT `mcvv_newsletter_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `mcvv_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_newsletter_recipient` ADD CONSTRAINT `mcvv_newsletter_recipient_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `mcvv_newsletter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

