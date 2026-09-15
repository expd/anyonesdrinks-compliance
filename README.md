# anyonesdrinks-compliance

Product information pages for the QR codes on our bottles, served at
`https://compliance.anyonesdrinks.com/<product>/`.

Each product is one JSON file. A build script turns them into plain static pages in five
languages (English, French, German, Italian, Spanish). The pages load nothing external, set
no cookies, and still show English if JavaScript is off. GitHub Actions rebuilds and
publishes the site on every push to `main`.

## Rules that protect printed bottles

1. **Never rename or delete a product's `slug`.** The slug is printed inside the QR code on every
   bottle. Keep discontinued products' pages online, since those bottles stay on shelves and in homes for years.
2. **Run `npm run check` before sending a label to print.** It fails if any `TODO` placeholder remains.
3. **Scan the printed proof on at least two phones** (one iPhone, one Android) before approving it.

## Files

```
products/hue-gin.json   one file per product; file name must equal the slug
site.json               brand name, domain, languages
src/i18n.json           translated labels, packaging materials and collection streams
src/style.css           page styling (inlined into each page at build time)
build.mjs               builds dist/ (no dependencies)
qr.mjs                  generates qr/<slug>.svg and .png
qr/                     print-ready QR codes, committed to the repo
```

## Filling in a product

Replace every value that starts with `TODO`. Until all are gone, pages show a yellow draft
notice and the placeholders are highlighted.

| Field | What to enter |
|---|---|
| `legalName` | The legal category under Regulation (EU) 2019/787, e.g. `Gin`, `Distilled Gin`, `London Gin`. Don't translate legal names. |
| `abv` | Number, e.g. `40` or `41.5` |
| `volumeCl` | Number, e.g. `70` |
| `eMark` | `true` if the ℮ mark is used on the label |
| `ingredients` | Optional for spirits. Set to `null` to hide the section |
| `allergens` | e.g. `"None"`. Allergens must **also** be on the physical label; the page can't replace it |
| `energy` | Optional: `{ "kj": 925, "kcal": 222 }`, or `null` to hide |
| `packaging` | One entry per part. `part` is `bottle`, `closure`, `capsule`, `label` or `box`. `code` is the EU material code, e.g. `GL 70`, `FOR 51`, `ALU 41` (see `src/i18n.json` for the full list) |
| `operator` | Legal company name, address lines, contact email |
| `gtin` | Leave `null` until you have a GS1 barcode. See below |

Text fields can be a single string or translated:

```json
"allergens": { "en": "None", "fr": "Aucun", "de": "Keine", "it": "Nessuno", "es": "Ninguno" }
```

Any language you leave out falls back to English.

To override the suggested bin for one part, add `disposal`:

```json
{ "part": "closure", "code": "FOR 51", "disposal": { "en": "Cork recycling point", "fr": "Point de collecte liège" } }
```

## Adding a product

1. Copy `products/hue-gin.json` to `products/<new-slug>.json` and set `"slug"` to match.
   Slugs are lowercase letters, numbers and hyphens.
2. Fill it in, then run `npm run check`.
3. Run `npm run qr` and commit the new files in `qr/`.
4. Push. The page is live at `https://compliance.anyonesdrinks.com/<new-slug>/` within a minute or two.

## Running locally

```bash
npm install        # once; only needed for QR generation
npm run build      # builds dist/ and lists remaining placeholders
npm run check      # same, but fails on placeholders
npm run qr         # regenerates QR codes in qr/
npm run preview    # builds and serves dist/ at a local URL
```

Add `?lang=fr` (or `de`, `it`, `es`) to a page URL to preview another language.

## One-time GitHub setup

1. Create a **public** repo named `anyonesdrinks-compliance` and push this folder to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Pages → Custom domain:** `compliance.anyonesdrinks.com`, then Save.
4. At your DNS provider, add a `CNAME` record: name `compliance`, value `<github-account>.github.io`
   (the account or organization that owns the repo).
5. Wait for the DNS check to pass, then tick **Enforce HTTPS**.
6. **Account/organization settings → Pages → Add a verified domain:** `anyonesdrinks.com`.
   This stops anyone else claiming the subdomain if the site is ever unpublished.
7. Protect `main` (Settings → Branches) so product files can't be deleted by accident.

If the workflow fails because an action version has been retired, bump the version numbers in
`.github/workflows/deploy.yml`.

## Printing the QR code

- Send the printer `qr/<slug>.svg`. It's vector, black on white, with error correction level Q.
- Keep the white border (quiet zone) that's built into the file. Don't crop it.
- Print it at least 20 mm wide including the border, on a flat part of the label, not across a curve or seam.
- Don't recolor it, invert it, or place a logo over it unless you test the printed result on several phones.

## GS1 barcodes later

When Hue Gin gets a GTIN, add it as `"gtin": "04006381333931"`. The build validates the check
digit and also publishes the same page at the GS1 Digital Link path
`/01/<14-digit GTIN>/`. The existing `/hue-gin/` URL keeps working, so bottles already printed are
unaffected. New labels can then use a GS1 Digital Link QR code if your retailers require one.

## Compliance note

This repo handles the publishing. The content is your responsibility. Rules differ by market,
especially what must stay on the physical label (allergens, alcohol strength, legal name,
volume) and each country's recycling-label requirements. Confirm with a labelling advisor for
each country you sell in.
