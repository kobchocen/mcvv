-- Potvrzení o přečtení zpráv pořadatele přihlašujícím (#108).
-- read_at = kdy přihlašující (přihlášený vlastník vlákna, ne pořadatel) zprávu pořadatele
-- poprvé zobrazil na webu, potvrdil přečtení nebo odpověděl. U zpráv přihlašujícího zůstává NULL.

-- AlterTable
ALTER TABLE `mcvv_message` ADD COLUMN `read_at` DATETIME(3) NULL;

-- Doplnění pro existující zprávy: co přihlašující už potvrdil (tlačítkem nebo odpovědí),
-- je přečtené nejpozději v čase posledního potvrzení vlákna (last_read_by_user).
UPDATE `mcvv_message` m
JOIN `mcvv_message_thread` t ON t.`id` = m.`thread_id`
SET m.`read_at` = t.`last_read_by_user`
WHERE m.`side` = 'staff'
  AND m.`read_at` IS NULL
  AND t.`last_read_by_user` IS NOT NULL
  AND m.`created_at` <= t.`last_read_by_user`;
