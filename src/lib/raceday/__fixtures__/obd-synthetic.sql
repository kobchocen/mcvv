-- Synthetic fixture data (no real participants) for the OBD export golden test.
DROP TABLE IF EXISTS cis_mcvv_kateg, cis_klub, cis_bezec, mcvv_prihlaska_radek, mcvv_info;
CREATE TABLE cis_mcvv_kateg (id char(1) NOT NULL PRIMARY KEY, jmeno varchar(20) NOT NULL, rekord smallint NOT NULL) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE cis_klub (id char(3) NOT NULL, rok smallint NOT NULL, jmeno varchar(50) NOT NULL, PRIMARY KEY (id, rok)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE cis_bezec (id char(8) NOT NULL PRIMARY KEY, jmeno varchar(50) NOT NULL) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE mcvv_prihlaska_radek (bezec_id char(8) NOT NULL, klub_id char(3) NOT NULL, kateg_id char(1) NOT NULL, rok smallint NOT NULL, cislo smallint NULL, PRIMARY KEY (rok, bezec_id)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE mcvv_info (id smallint NOT NULL PRIMARY KEY, datum date NOT NULL) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Latest edition by id (not by date) decides the year, like legacy: id 2 → 2026.
INSERT INTO mcvv_info VALUES (1, '2030-01-01'), (2, '2026-12-06');
INSERT INTO cis_mcvv_kateg VALUES
 ('A','muži',885), ('B',' muži nad 40 let\t',0), ('F','ženy',59), ('J','žáci',60), ('K','žákyně',3599), ('Z','Řádní veteráni',6000);
INSERT INTO cis_klub VALUES
 ('000',2026,''), ('000',2025,'stary prazdny'),
 ('010',2026,'Oddíl deset'), ('10',2026,'Volné porovnání PHP: "10" == "010"'),
 ('1e1',2026,'Taky číslo deset (1e1)'),
 ('CHC',2024,'K.O.B. Choceň (starý název)'), ('CHC',2026,'  K.O.B. Choceň  '),
 ('LPU',2025,'Lokomotiva Pardubice'),
 ('ÚOL',2026,'Ústí nad Orlicí – Šťastný oddíl'),
 ('ZZZ',2023,'Łódź & Öhlschläger');
INSERT INTO cis_bezec VALUES
 ('19800001','Novák Jan'), ('19805001','Šťastná Ďáblová Řehořa'), ('19900002','  Žluťoučký Kůň  '),
 ('20000003','Středník; Jan'), ('20105004','Őrsi Łucja'), ('20120005','Čech Ěmil'),
 ('20150006','Tab\tUvnitř'), ('20200007','Poslední Běžec'), ('20210008','Bez Čísla');
INSERT INTO mcvv_prihlaska_radek VALUES
 ('19800001','CHC','A',2026,301),
 ('19805001','000','F',2026,5),
 ('19900002','ÚOL','A',2026,5),
 ('20000003','010','J',2026,99),
 ('20105004','ZZZ','K',2026,100),
 ('20120005','LPU','B',2026,1000),
 ('20150006','CHC','Z',2026,0),
 ('20210008','CHC','A',2026,NULL),
 ('19800001','CHC','A',2025,1),
 ('20200007','10','J',2026,601);
