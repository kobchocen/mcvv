-- E-mailová fronta: jen nové (prázdné) tabulky, žádný zásah do existujících tabulek.

-- CreateTable
CREATE TABLE `mcvv_mail_queue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` ENUM('auth', 'confirmation', 'alert', 'contact', 'reminder', 'summary', 'other') NOT NULL,
    `priority` TINYINT NOT NULL DEFAULT 1,
    `to_email` VARCHAR(255) NOT NULL,
    `reply_to` VARCHAR(255) NULL,
    `subject` VARCHAR(300) NOT NULL,
    `html` MEDIUMTEXT NOT NULL,
    `text` MEDIUMTEXT NOT NULL,
    `dedupe_key` VARCHAR(120) NULL,
    `status` ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    `attempts` SMALLINT NOT NULL DEFAULT 0,
    `not_before` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claim_token` VARCHAR(36) NULL,
    `claimed_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NULL,
    `provider_id` VARCHAR(64) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcvv_mail_queue_dedupe_key_key`(`dedupe_key`),
    INDEX `mcvv_mail_queue_status_priority_not_before_idx`(`status`, `priority`, `not_before`),
    INDEX `mcvv_mail_queue_sent_at_idx`(`sent_at`),
    INDEX `mcvv_mail_queue_claim_token_idx`(`claim_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_mail_day` (
    `day` DATE NOT NULL,
    `quota_exceeded_at` DATETIME(3) NULL,
    `cap_alert_sent_at` DATETIME(3) NULL,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Rychlé počítání odeslaných newsletterů za den (malá tabulka, krátký lock).
CREATE INDEX `mcvv_newsletter_recipient_sent_at_idx` ON `mcvv_newsletter_recipient`(`sent_at`);
