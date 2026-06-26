--
-- Struktura tabulky `cis_mcvv_kateg`
-- Číselník kategorií MCVV

CREATE TABLE `cis_mcvv_kateg` (
  `id` char(1) NOT NULL,
  `jmeno` varchar(20) NOT NULL,
  `age` smallint(6) NOT NULL,
  `sort` smallint(6) NOT NULL,
  `sex` char(1) NOT NULL,
  `rekord` smallint(6) NOT NULL,
  `startovne` smallint(6) NOT NULL,
  `cislo_od` smallint(6) NOT NULL,
  `cislo_do` smallint(6) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

-- Indexy pro tabulku `cis_mcvv_kateg`
--
ALTER TABLE `cis_mcvv_kateg`
  ADD PRIMARY KEY (`id`);
COMMIT;


-- --------------------------------------------------------

--
-- Struktura tabulky `cis_bezec`
-- Číselník běžců

CREATE TABLE `cis_bezec` (
  `id` char(8) NOT NULL,
  `jmeno` varchar(50) NOT NULL,
  `created` datetime DEFAULT NULL,
  `autor` varchar(64) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `cis_bezec`
--
ALTER TABLE `cis_bezec`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_UserCisBezec` (`autor`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `cis_fotka_autor`
-- Číselník fotografů

CREATE TABLE `cis_fotka_autor` (
  `id` char(1) NOT NULL,
  `popis` varchar(30) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `cis_fotka_autor`
--
ALTER TABLE `cis_fotka_autor`
  ADD PRIMARY KEY (`id`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `cis_fotka_kde`
-- Číselník místa fotografie

CREATE TABLE `cis_fotka_kde` (
  `id` char(1) NOT NULL,
  `popis` varchar(20) NOT NULL,
  `sort` smallint(6) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `cis_fotka_kde`
--
ALTER TABLE `cis_fotka_kde`
  ADD PRIMARY KEY (`id`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `cis_klub`
-- Číselník klubů v rámci roků

CREATE TABLE `cis_klub` (
  `id` char(3) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `jmeno` varchar(50) NOT NULL,
  `created` datetime DEFAULT NULL,
  `autor` varchar(64) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `cis_klub`
--
ALTER TABLE `cis_klub`
  ADD PRIMARY KEY (`id`,`rok`),
  ADD KEY `FK_UserCisKlub` (`autor`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `cis_typ_webimages`
-- Číselník typů obrázků pro web

CREATE TABLE `cis_typ_webimages` (
  `id` smallint(6) NOT NULL,
  `popis` varchar(20) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `cis_typ_webimages`
--
ALTER TABLE `cis_typ_webimages`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT pro tabulku `cis_typ_webimages`
--
ALTER TABLE `cis_typ_webimages`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_info`
-- Základní info o jednotlivých ročnících závodu

CREATE TABLE `mcvv_info` (
  `id` smallint(6) NOT NULL,
  `datum` date NOT NULL,
  `weather` varchar(64) DEFAULT NULL,
  `temp` smallint(6) DEFAULT NULL,
  `zhl` tinyint(1) DEFAULT 1,
  `iscarex` tinyint(1) DEFAULT 0,
  `prihl_datum` date DEFAULT NULL,
  `prihl_mail` varchar(32) DEFAULT 'mcvv@mcvv.org',
  `start_deti_mail` smallint(6) DEFAULT 20,
  `start_deti_mist` smallint(6) DEFAULT 50,
  `start_dosp_mail` smallint(6) DEFAULT 50,
  `start_dosp_mist` smallint(6) DEFAULT 100,
  `st_interval` smallint(6) DEFAULT 15,
  `infomail` varchar(32) DEFAULT 'mcvv@mcvv.org',
  `infowww` varchar(32) DEFAULT 'www.mcvv.org',
  `infotel` varchar(16) DEFAULT '',
  `fin_dosp_1` smallint(6) DEFAULT 2000,
  `fin_dosp_2` smallint(6) DEFAULT 1000,
  `fin_dosp_3` smallint(6) DEFAULT 500,
  `fin_dosp_4` smallint(6) DEFAULT 200,
  `fin_dosp_5` smallint(6) DEFAULT 100,
  `fin_vet_1` smallint(6) DEFAULT 300,
  `fin_vet_2` smallint(6) DEFAULT 200,
  `fin_vet_3` smallint(6) DEFAULT 100
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_info`
--
ALTER TABLE `mcvv_info`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT pro tabulku `mcvv_info`
--
ALTER TABLE `mcvv_info`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_bezec_fotka`
-- Asociační tabulka pro běžce a fotku

CREATE TABLE `mcvv_bezec_fotka` (
  `fotka_id` char(8) NOT NULL,
  `bezec_id` char(8) NOT NULL,
  `poradi_zleva` smallint(6) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_bezec_fotka`
--
ALTER TABLE `mcvv_bezec_fotka`
  ADD PRIMARY KEY (`fotka_id`,`bezec_id`),
  ADD KEY `FK_CisBezecMBF` (`bezec_id`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_fotky`
-- Data fotek

CREATE TABLE `mcvv_fotky` (
  `id` int(11) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `kde_id` char(1) NOT NULL,
  `debug_text` text DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  `original_filename` varchar(255) DEFAULT NULL,
  `autor` varchar(8) DEFAULT NULL,
  `image` mediumblob DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_fotky`
--
ALTER TABLE `mcvv_fotky`
  ADD PRIMARY KEY (`id`) USING BTREE,
  ADD KEY `FK_CisFKdeMFotky` (`kde_id`),
  ADD KEY `FK_UserMFotky` (`autor`);

--
-- AUTO_INCREMENT pro tabulku `mcvv_fotky`
--
ALTER TABLE `mcvv_fotky`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16593;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_news`
-- Data novinky na webu

CREATE TABLE `mcvv_news` (
  `id` smallint(6) NOT NULL,
  `datum` timestamp NOT NULL DEFAULT current_timestamp(),
  `nadpis` varchar(64) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `uvod` mediumtext DEFAULT NULL,
  `obsah` text DEFAULT NULL,
  `webimage_id` smallint(6) NOT NULL DEFAULT 1
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_news`
--
ALTER TABLE `mcvv_news`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_Webimages` (`webimage_id`);

--
-- AUTO_INCREMENT pro tabulku `mcvv_news`
--
ALTER TABLE `mcvv_news`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=441;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `webimages`
-- Data obrázků pro web

CREATE TABLE `webimages` (
  `id` smallint(6) NOT NULL,
  `typ_id` smallint(6) NOT NULL,
  `bezec_id` char(8) DEFAULT NULL,
  `popis` varchar(128) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `rok` smallint(6) DEFAULT NULL,
  `image` mediumblob DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `webimages`
--
ALTER TABLE `webimages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_CisTypWebimages` (`typ_id`);

--
-- AUTO_INCREMENT pro tabulku `webimages`
--
ALTER TABLE `webimages`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=199;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_prihlaska`
-- Data hlavičky přihlášek

CREATE TABLE `mcvv_prihlaska` (
  `id` smallint(11) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `email` varchar(128) DEFAULT NULL,
  `typ` char(1) DEFAULT NULL,
  `poznamka` mediumtext DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  `nazev` varchar(128) DEFAULT NULL,
  `securitycode` varchar(32) DEFAULT NULL,
  `stav` smallint(6) DEFAULT NULL,
  `autor` varchar(64) DEFAULT NULL,
  `promotion` varchar(32) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_prihlaska`
--
ALTER TABLE `mcvv_prihlaska`
  ADD PRIMARY KEY (`rok`,`id`) USING BTREE;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_prihlaska_radek`
-- Data řádky přihlášek

CREATE TABLE `mcvv_prihlaska_radek` (
  `bezec_id` char(8) NOT NULL,
  `klub_id` char(3) NOT NULL,
  `kateg_id` char(1) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `cislo` smallint(6) DEFAULT NULL,
  `prihlaska_id` smallint(6) NOT NULL,
  `startovne` smallint(6) DEFAULT NULL,
  `poznamka` varchar(128) DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  `autor` varchar(64) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_prihlaska_radek`
--
ALTER TABLE `mcvv_prihlaska_radek`
  ADD PRIMARY KEY (`rok`,`bezec_id`),
  ADD KEY `FK_CisBezecMPrihlR` (`bezec_id`),
  ADD KEY `FK_CisKlubMPrihlR` (`klub_id`),
  ADD KEY `FK_CisKategMPrihlR` (`kateg_id`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_platba`
-- Data platby za startovné

CREATE TABLE `mcvv_platba` (
  `rok` smallint(6) NOT NULL DEFAULT 2018,
  `prihlaska_id` char(3) NOT NULL,
  `datum` date DEFAULT NULL,
  `castka` smallint(6) DEFAULT NULL,
  `created` datetime DEFAULT current_timestamp(),
  `id` int(11) NOT NULL,
  `autor` varchar(8) DEFAULT 'admin'
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_platba`
--
ALTER TABLE `mcvv_platba`
  ADD PRIMARY KEY (`id`),
  ADD KEY `FK_MPrihlMPlatba` (`prihlaska_id`),
  ADD KEY `FK_UserMPlatba` (`autor`);

--
-- AUTO_INCREMENT pro tabulku `mcvv_platba`
--
ALTER TABLE `mcvv_platba`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1516;
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_start`
-- DAta startovní časy

CREATE TABLE `mcvv_start` (
  `bezec_id` char(8) NOT NULL,
  `klub_id` char(3) NOT NULL,
  `kateg_id` char(1) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `cislo` smallint(6) NOT NULL,
  `bezec_name` varchar(50) DEFAULT NULL,
  `klub_name` varchar(50) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_start`
--
ALTER TABLE `mcvv_start`
  ADD PRIMARY KEY (`rok`,`bezec_id`),
  ADD KEY `FK_CisBezecMcvvStart` (`bezec_id`),
  ADD KEY `FK_CisKlubMcvvStart` (`klub_id`),
  ADD KEY `FK_CisKategMcvvStart` (`kateg_id`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_time`
-- Data časy / výsledky

CREATE TABLE `mcvv_time` (
  `bezec_id` char(8) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `klub_id` char(3) NOT NULL,
  `kateg_id` char(1) NOT NULL,
  `time` smallint(6) NOT NULL,
  `bezec_name` varchar(50) DEFAULT NULL,
  `klub_name` varchar(50) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_time`
--
ALTER TABLE `mcvv_time`
  ADD PRIMARY KEY (`rok`,`bezec_id`),
  ADD KEY `FK_CisBezecMcvvTime` (`bezec_id`),
  ADD KEY `FK_CisKlubMcvvTime` (`klub_id`),
  ADD KEY `FK_CisKategMcvvTime` (`kateg_id`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `mcvv_split`
-- Data mezičasy

CREATE TABLE `mcvv_split` (
  `cislo` smallint(6) NOT NULL,
  `rok` smallint(6) NOT NULL,
  `split` char(1) NOT NULL,
  `time` smallint(6) NOT NULL,
  `created` datetime DEFAULT NULL,
  `autor` varchar(8) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `mcvv_split`
--
ALTER TABLE `mcvv_split`
  ADD PRIMARY KEY (`cislo`,`rok`,`split`),
  ADD KEY `FK_UserMSplit` (`autor`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `users`
-- Číselník uživatelé

CREATE TABLE `users` (
  `a_user` varchar(8) NOT NULL DEFAULT '',
  `a_passwd` varchar(8) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`a_user`);
COMMIT;

-- --------------------------------------------------------

--
-- Struktura tabulky `sponsors`
-- Data info o sponzorech

CREATE TABLE `sponsors` (
  `id` smallint(6) NOT NULL,
  `nazev` varchar(128) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL,
  `link` varchar(128) DEFAULT NULL,
  `image` varchar(64) DEFAULT NULL,
  `category` smallint(6) NOT NULL,
  `poradi` smallint(6) NOT NULL,
  `active` tinyint(1) DEFAULT NULL,
  `description` varchar(1024) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_czech_ci;

--
-- Indexy pro tabulku `sponsors`
--
ALTER TABLE `sponsors`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT pro tabulku `sponsors`
--
ALTER TABLE `sponsors`
  MODIFY `id` smallint(6) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=40;
COMMIT;
