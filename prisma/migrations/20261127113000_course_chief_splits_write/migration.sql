-- Šéf trati: výchozí oprávnění zápisu mezičasů na všech stanovištích.
-- `mcvv_role_section` drží jen odchylky. Když v DB zbyla stará výchozí hodnota
-- `read`, smažeme ji, aby platil nový default `write`. Explicitní `none` necháme.

DELETE FROM `mcvv_role_section`
WHERE `role` = 'course_chief'
  AND `section_id` IN ('screens.splits', 'screens')
  AND `level` = 'read';
