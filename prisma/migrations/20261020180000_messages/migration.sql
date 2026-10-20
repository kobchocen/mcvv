-- Zprávy mezi přihlašujícím a pořadatelem (#108): nové tabulky, nový druh e-mailu „message“
-- a převod letošních (2026) poznámek z mcvv_prihlaska.poznamka na první zprávu vlákna.
-- Sloupec mcvv_prihlaska.poznamka zůstává beze změny (starší ročníky = interní poznámka).

-- AlterTable
ALTER TABLE `mcvv_mail_queue` MODIFY `kind` ENUM('auth', 'confirmation', 'alert', 'contact', 'reminder', 'summary', 'other', 'message') NOT NULL;

-- CreateTable
CREATE TABLE `mcvv_message_thread` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `rok` SMALLINT NULL,
    `prihlaska_id` SMALLINT NULL,
    `subject` VARCHAR(200) NULL,
    `status` ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    `last_message_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_user_message_at` DATETIME(3) NULL,
    `last_staff_message_at` DATETIME(3) NULL,
    `last_read_by_user` DATETIME(3) NULL,
    `last_read_by_staff` DATETIME(3) NULL,
    `user_notified_at` DATETIME(3) NULL,
    `staff_notified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mcvv_message_thread_user_id_idx`(`user_id`),
    INDEX `mcvv_message_thread_status_last_user_message_at_idx`(`status`, `last_user_message_at`),
    UNIQUE INDEX `mcvv_message_thread_rok_prihlaska_id_key`(`rok`, `prihlaska_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcvv_message` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `thread_id` INTEGER NOT NULL,
    `author_user_id` INTEGER NULL,
    `side` ENUM('user', 'staff') NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mcvv_message_thread_id_created_at_idx`(`thread_id`, `created_at`),
    INDEX `mcvv_message_author_user_id_created_at_idx`(`author_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcvv_message_thread` ADD CONSTRAINT `mcvv_message_thread_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_message` ADD CONSTRAINT `mcvv_message_thread_id_fkey` FOREIGN KEY (`thread_id`) REFERENCES `mcvv_message_thread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcvv_message` ADD CONSTRAINT `mcvv_message_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `mcvv_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Převod poznámek ročníku 2026: každá neprázdná poznámka = vlákno přihlášky s jednou zprávou
-- od přihlašujícího (side = user), pro pořadatele označené jako přečtené.
-- „Neprázdná“ = obsahuje aspoň jeden nebílý znak (TRIM neodstraní CR/LF – legacy data mají
-- i poznámky jen s „\r\n“).
-- user_id / author_user_id zůstávají NULL: přístup přihlašujícího se řídí e-mailem přihlášky
-- (stejně jako dnes u přihlášky), takže netřeba párovat účty (a riskovat rozdílné kolace).
INSERT INTO `mcvv_message_thread`
    (`user_id`, `rok`, `prihlaska_id`, `subject`, `status`, `last_message_at`,
     `last_user_message_at`, `last_read_by_staff`, `created_at`, `updated_at`)
SELECT NULL, p.`rok`, p.`id`, NULL, 'open',
       COALESCE(m.`updated_at`, p.`created`, CURRENT_TIMESTAMP(3)),
       COALESCE(m.`updated_at`, p.`created`, CURRENT_TIMESTAMP(3)),
       COALESCE(m.`updated_at`, p.`created`, CURRENT_TIMESTAMP(3)),
       COALESCE(m.`updated_at`, p.`created`, CURRENT_TIMESTAMP(3)),
       CURRENT_TIMESTAMP(3)
FROM `mcvv_prihlaska` p
LEFT JOIN `mcvv_prihlaska_meta` m ON m.`rok` = p.`rok` AND m.`id` = p.`id`
WHERE p.`rok` = 2026
  AND p.`poznamka` IS NOT NULL
  AND p.`poznamka` REGEXP '[^[:space:]]';

INSERT INTO `mcvv_message` (`thread_id`, `author_user_id`, `side`, `body`, `created_at`)
SELECT t.`id`, NULL, 'user', LEFT(REGEXP_REPLACE(p.`poznamka`, '^[[:space:]]+|[[:space:]]+$', ''), 16000), t.`last_user_message_at`
FROM `mcvv_message_thread` t
JOIN `mcvv_prihlaska` p ON p.`rok` = t.`rok` AND p.`id` = t.`prihlaska_id`
WHERE t.`rok` = 2026
  AND p.`poznamka` IS NOT NULL
  AND p.`poznamka` REGEXP '[^[:space:]]';
