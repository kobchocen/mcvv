# Brief 09f2 — Hero, seznam přihlášených, klub, admin seznam

Větev **feature/admin**. Push jen na ni.

## 1) Hero countdown

Čtyři velké boxy u přihlášek pryč.

Jedna decentní věta pod tlačítkem Přihlášky, např.:
`Online přihlášky končí za 67 dní` (při < 48 h i hodiny/minuty).
Musí být jasné, že jde o **uzávěrku online přihlášek** (`prihl_datum`), ne o start závodu.

Po uzávěrce věta pryč. „Přihlášeno N běžců“ nechat malým písmem.

Tlačítko **Přihlášky** → `/prihlaseni-zavodnici`, ne `/startovka`.

## 2) Dvě stránky

`/startovka` = Startovní listina. Znovu placeholder: čísla a intervalové časy až po losu a zveřejnění adminem (mimo tuto vlnu).

Nová `/prihlaseni-zavodnici` = přehled kdo je přihlášen (to, co teď omylem visí na startovce).
Titulek **Přihlášení závodníci**. Obsah stejný: uzávěrka, odkaz na `/prihlasky` do konce termínu, po termínu text o prezentaci, seznam jen stav 5 dle kategorií.

Odkazy z hero, z O závodě „Startovka“ zatím nechat na `/startovka` (placeholder). Veřejný přehled jen z hero Přihlášky.

## 3) Klub

`cis_klub.id` na řádku je povinné. Prázdný klub = id `000` v daném roce, `jmeno` prázdné. V UI se ukáže prázdné, ne „000“.

**Registrace účtu** `/registrace`: pole **Název klubu** nepovinné. Uložit k uživateli (nový sloupec `mcvv_user.club_name`, varchar 50, nullable).

Nová přihláška:

- název přihlášky = klub z účtu, jinak jméno uživatele
- default klub u běžce = název přihlášky, **pokud** účet má klub; jinak prázdný (`000`)

U každého běžce (nový, rychlá nabídka, existující řádek): combobox + volný text **nebo prázdné**.
Změna jen toho řádku. Rodina může mít různé kluby včetně prázdného.

## 4) Admin /prihlasky

- Nadpis `Přihlášky 2026` (vybraný rok).
- Input Rok a tlačítko Rok pryč. Přepínání jen odkazy roků.
- U stavu 3 a 4 v řádku **Potvrdit** (stejná akce + Resend jako v detailu).

## Mimo

Los, čísla, zveřejnění startovky, navbar ikony.

## Akceptace

lint + format:check + typecheck. Commit, push.
Screenshot: hero (malý countdown + popisek), /prihlaseni-zavodnici, /startovka placeholder, registrace s klubem, admin seznam s Potvrdit.
