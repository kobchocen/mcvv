-- Role Předstartér (#379): mobilní obrazovka /predstarter pro jednu frontu koridoru.
-- Pouze nová hodnota výčtu na konec (bezpečné pro PROD), existující data se nemění.

ALTER TABLE `mcvv_user` MODIFY `role` ENUM('registrar', 'organizer', 'admin', 'timing', 'splitmaker', 'race_office', 'starter', 'resultboard', 'prestarter') NOT NULL;
