-- Role Resultboard: jen obrazovky výsledků v cíli (/resultboard), bez administrace.
-- Pouze nová hodnota výčtu, existující data se nemění.

ALTER TABLE `mcvv_user` MODIFY `role` ENUM('registrar', 'organizer', 'admin', 'timing', 'splitmaker', 'race_office', 'starter', 'resultboard') NOT NULL;
