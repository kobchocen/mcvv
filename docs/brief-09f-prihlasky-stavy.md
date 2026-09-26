# Brief 09f — Přihlášky: klub, startovné, stavy, veřejný seznam

Větev **feature/admin**. Push jen na ni.

Rozpis, profil tratě, auth nesahej. Resend už je.

## 1) Formulář /prihlasky

Klub u **každého** řádku: combobox z `cis_klub` pro aktuální rok **plus volný text**.
Nový název → `resolveClubId` (letos / historie / nové id). V jedné přihlášce různé kluby.
Nebrat klub z názvu přihlášky.

Hlavička: tlačítko **Uložit** aktivní jen když se název / poznámka / promotion změnily. Po uložení neaktivní, text Uloženo.

Odebrat → ikona koše, `aria-label` Odebrat.

Label **Ročník** (ne Ročník narození).

## 2) Startovné 0 Kč

Při přidání i při přepočtu řádku:

1. E-mail přihlášky (lower) je v nastavení „přihláška zdarma“ → 0.
2. Jinak `bezec_id` je absolutní vítěz M nebo Ž v jakémkoli roce (`getAbsoluteWinners`) → 0.
3. Jinak `bezec_id` je v klubu veteránů (`getVeteranClub`) → 0.
4. Jinak `cis_mcvv_kateg.startovne`.

Na řádku u 0 Kč krátce důvod (pořadatel / vítěz / veterán).

## 3) Nastavení v adminu

Dlaždice **Nastavení** na `/admin`.
`/admin/nastaveni` — jen admin (ne organizer).

První pole: seznam e-mailů (jeden na řádek), case-insensitive.
Tabulka `mcvv_setting` (klíč + text). Klíč `free_entry_emails`.

## 4) Stavy

`stav` v `mcvv_prihlaska` (ne nový sloupec):

| stav | význam                                        |
| ---- | --------------------------------------------- |
| 0    | zrušená                                       |
| 1    | nová prázdná (0 běžců)                        |
| 2    | nezaplacená (1+ běžců, platby < startovné)    |
| 3    | zaplacená (platby = startovné, startovné > 0) |
| 4    | přeplacená (platby > startovné)               |
| 5    | potvrzená                                     |

Po každé změně řádků / plateb přepočítat, **kromě** 0 a 5.
Výjimka: stav 5 a po změně platby < startovné → nastavit 2.
Startovné 0 a 1+ běžců bez storna → 3 (zaplacená), admin může potvrdit na 5.

Nová přihláška: stav 1.

Admin na detailu:

- stav 1 nebo 2 → **Zrušit** → 0. Řádky nechat.
- stav 3 nebo 4 → **Potvrdit** → 5 + e-mail Resend (rekapitulace běžců, startovné, platby, poděkování). Chybí-li klíč, stav 5 i tak, chybu ukázat v adminu.
- 0 a 5 bez těchto tlačítek.

Seznam `/admin/prihlasky`: sloupec stav slovy + barva. Filtr podle stavu. Zrušené defaultně schovat, přepínač „včetně zrušených“.

Veřejný seznam a hero počítají **jen stav 5**.

## 5) Veřejná stránka `/startovka`

Místo placeholderu.

- uzávěrka z `mcvv_info.prihl_datum` (ročník 34)
- odkaz Přihlásit se → `/prihlasky` jen do konce uzávěrky (včetně toho dne, Europe/Prague)
- po uzávěrce text: online skončily, na místě do 9:45 za dvojnásobné startovné (dospělí 200 / žáci 100, z ročníku `start_*_mist`)
- seznam běžců ze stavu 5, skupiny podle kategorie (`sort`), v kategorii jméno + ročník + klub
- bez e-mailů, bez plateb

## 6) Hero

Tlačítko **Výsledky** pryč.

Místo Přihlásit se: velké **Přihlášky** → `/startovka` (ne `/prihlasky`, ne login).

Do uzávěrky pod tlačítkem: countdown k `prihl_datum` 23:59 Prague + „Přihlášeno N běžců“ (řádky ve stavu 5).
Po uzávěrce countdown pryč, tlačítko Přihlášky zůstane (veřejný seznam).

## Mimo

Tisk čísel, los, newsletter, online platba. Navbar nesahej.

## Akceptace

lint + format:check + typecheck.
Screenshot: formulář s volným klubem a košem, admin stavy, nastavení e-mailů, /startovka, hero.
