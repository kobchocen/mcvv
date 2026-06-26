
--
-- Vypisuji data pro tabulku `cis_typ_webimages`
--

INSERT INTO `cis_typ_webimages` (`id`, `popis`) VALUES
(1, 'news'),
(2, 'profil'),
(3, 'veranda'),
(4, 'pozvánka'),
(5, 'kalendář');


--
-- Vypisuji data pro tabulku `cis_mcvv_kateg`
--

INSERT INTO `cis_mcvv_kateg` (`id`, `jmeno`, `age`, `sort`, `sex`, `rekord`, `startovne`, `cislo_od`, `cislo_do`) VALUES
('I', 'ženy nad 60 let', 60, 13, 'F', 1569, 100, 721, 730),
('K', 'žákyně', 14, 8, 'F', 1171, 50, 641, 680),
('A', 'muži', 0, 3, 'M', 885, 100, 301, 380),
('B', 'muži nad 40 let', 40, 4, 'M', 1009, 100, 201, 290),
('C', 'muži nad 50 let', 50, 5, 'M', 1072, 100, 131, 190),
('D', 'muži nad 60 let', 60, 6, 'M', 1197, 100, 691, 710),
('J', 'žáci', 14, 1, 'M', 1098, 50, 41, 90),
('L', 'dorostenci', 18, 2, 'M', 964, 50, 861, 900),
('F', 'ženy', 0, 10, 'F', 1048, 100, 901, 930),
('G', 'ženy nad 40 let', 40, 11, 'F', 1091, 100, 771, 810),
('H', 'ženy nad 50 let', 50, 12, 'F', 1220, 100, 741, 760),
('E', 'muži nad 70 let', 70, 7, 'M', 1482, 100, 111, 120),
('M', 'dorostenky', 18, 9, 'F', 1076, 50, 821, 850);


--
-- Vypisuji data pro tabulku `cis_fotka_kde`
--

INSERT INTO `cis_fotka_kde` (`id`, `popis`, `sort`) VALUES
('R', 'před startem', 20),
('A', 'Atmosféra', 10),
('S', 'na startu', 30),
('T', 'na trati', 40),
('C', 'v cíli', 50),
('P', 'po závodě', 60),
('V', 'na stupních vítězů', 70),
('N', 'nerozpoznáno', 999);


--
-- Vypisuji data pro tabulku `cis_fotka_autor`
--

INSERT INTO `cis_fotka_autor` (`id`, `popis`) VALUES
('U', 'Uwe Filter'),
('J', 'Jiří Čech'),
('O', 'Ondřej Pešek'),
('C', 'K.O.B. Choceň'),
('F', 'František Sládek'),
('T', 'Tomáš Křivda'),
('M', 'Martin Křivda'),
('P', 'Pavel Švadlena'),
('I', 'Ivana Švadlenová'),
('V', 'Vojtěch Grundman');
