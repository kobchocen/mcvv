# Brief 08e — Hero dvě varianty

Větev **feature/web-obsah**. Push ano. main/develop nesahej.

Owner nahraje do `public/images/`:

- `hero-trat-kopec.jpg` — slunce, výhled, řeka
- `hero-trat-mlha.jpg` — mlha, tma, les

Obě nech v gitu. Hero ber z konstanty v hero komponentě:

```
const HERO_VARIANT = "mlha" as "mlha" | "kopec"
```

`mlha` → hero-trat-mlha.jpg, `kopec` → hero-trat-kopec.jpg.

Zachovej overlay (gradient, titulek, CTA). object-cover, ohnisko na běžcích. Default **mlha**.

Jiné sekce nesahej. lint + format:check + typecheck. Commit, push na feature/web-obsah.
