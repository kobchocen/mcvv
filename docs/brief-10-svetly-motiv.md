# Brief 10 — Světlý motiv, čitelnost

Větev **feature/web-obsah**. Push ano. Dark theme nesahej víc, než je nutné (společné utility ať v dark zůstanou čitelné).

## Musí platit v light

Text a čísla na pozadí mají kontrast. Hover taky.

1. **Navbar** — položky menu, jazyk, theme toggle: tmavý text na světlém baru. Logo „MALÁ CENA / VELKÉ VERANDY“ čitelné.
2. **Hero statistiky** — 4300 a 200 teď bílé na bílém. Čísla i popisky v light tmavé (nebo boxy dark jako v dark theme).
3. **Hero fotka** — tmavý overlay v light zeslabit, ať scéna není černá skvrna. Titulek bílý se stínem / silnější gradient jen pod textem vlevo. Fotku neměň.
4. **S02 mapa** — box START · CÍL: text čitelný (tmavý na světlém). Šipka k S/C i na náhledu, ne jen v modalu.
5. **Modal mapy** — nápis TRAŤ ZÁVODU nesmí kolidovat s křížkem. Posunout nápis nebo křížek.
6. **S04 / S05** — hover u „Archiv výsledků“ a „Fotogalerie“: text zůstane čitelný (ne bílá na bílé).
7. **CTA „Přihlásit se na závod“** — v light viditelné (tmavý text na světlém, nebo orange filled).
8. **Patička** — logo a „MALÁ CENA VELKÉ VERANDY“ čitelné.

Copy v S02: **200 m** ne „200 m+“.

## Akceptace

- [ ] Light: navbar, hero čísla, CTA, patička, hover S04/S05.
- [ ] S02 box + šipka na náhledu; modal bez kolize.
- [ ] Dark pořád čitelný.
- [ ] lint + format:check.

Screenshoty light: hero, S02, modal, S04 hover, CTA, patička.
