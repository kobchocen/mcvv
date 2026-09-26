# Brief 09b2 — Číselníky na samostatné stránky

Větev **feature/admin**. Push na ni. Auth, partneři a ročníky nesahej.

## Proč

`/admin/ciselniky` má kategorie i kluby pod sebou. Číselníků bude víc, jedna stránka nestačí.

## Cesty

- `/admin/ciselniky` — jen rozcestník karet (název + krátký popis + odkaz). Zatím dvě: Kategorie, Kluby.
- `/admin/ciselniky/kategorie` — stávající tabulka kategorií (editace beze změny chování).
- `/admin/ciselniky/kluby` — stávající kluby podle roku.

Menu „Číselníky“ vede na rozcestník. Na podstránce odkaz „Zpět na číselníky“.

## Mimo

Nové číselníky, běžci, přihlášky.

## Akceptace

lint + format:check. Commit, push.
Screenshot rozcestníku a obou podstránek.
