# Qur'an Ayah of the Day

A compact, clickable Qur'an banner for a GitHub README. The Arabic writes in
solid ink while the translation types alongside it. Both texts come from
[Tanzil](https://tanzil.net/). No API key, hosted service, or browser script.

<!-- ayah-of-the-day:start -->
<a href="https://quran.com/94/5"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/ayah-dark.svg"><img src="assets/ayah-light.svg" alt="Daily Quran ayah, Ash-Sharh 94:5, Arabic with Saheeh International translation. Read on Quran.com." width="100%"></picture></a>

<sub><a href="https://tanzil.net/">Tanzil Project</a> · <a href="https://tanzil.net/trans/">Saheeh International</a></sub>
<!-- ayah-of-the-day:end -->

Open **preview.html** after extracting the ZIP to see the light, charcoal,
green/gold and transparent variants. Expand the long-ayah examples to view
2:255 and 2:282. This is a local preview, not a deployed GitHub profile.

## Add it to your profile

1. Use your public profile repository (its name must match your username).
   Copy [examples/profile-workflow.yml](examples/profile-workflow.yml) into
   that repository as `.github/workflows/daily-ayah.yml`.
2. The example uses `KitCatasha/quran-ayah-of-the-day@v1`. The Action's
   repository must be public and have a `v1` tag. If hosting a fork, change
   the owner and reference to match your fork.
3. Put this block in your profile README where you want the banner:

```html
<!-- ayah-of-the-day:start -->
<!-- ayah-of-the-day:end -->
```

4. Go to **Actions → Update Qur'an ayah card → Run workflow**. The Action
   creates both theme files and replaces only the marked section.
   With no markers, it adds the banner at the end of the README.

The workflow must be on the default branch and needs `contents: write` for
its commit. If your branch rejects direct pushes, use a pull-request workflow
instead of disabling your branch protections.

### Test it

- Open `preview.html` locally to check the animations without installing anything.
- In the profile repository, manually run the workflow with its optional
  **verse** field set to `94:5`, then again with `2:255`. Check for a successful
  run, two SVG files in `assets/`, and a banner that links to the matching
  verse. A test run updates the README immediately; run it once more with
  the field blank to restore the daily ayah. Scheduled runs ignore this field.

### One-line embed

For a **fixed** 94:5 banner, use this markup. The workflow above generates
the correct link and alt text automatically for the **daily** banner.

```html
<a href="https://quran.com/94/5"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/ayah-dark.svg"><img src="./assets/ayah-light.svg" width="100%" alt="Ash-Sharh 94:5 in Arabic with English translation"></picture></a>
```

Keep the Arabic source and translator credit below the embed; the card does not
repeat them. The workflow adds both automatically. On GitHub, use the `<picture>` pair rather than
relying on the SVG's `auto` theme; theme switching still depends on how the
page and browser evaluate the preference. The solid variants have readable
contrast on either page background.

## Action inputs

This project distributes a **GitHub Action**, not an HTTP endpoint.
Use `with:` inputs rather than URL query parameters.

| Input | Default | Options |
| --- | --- | --- |
| `theme` | `auto` | `light`, `dark` or `auto`. Ignored when generating a theme pair. |
| `palette` | `neutral` | `neutral` (paper/charcoal and gold), `green-gold`, `transparent` |
| `bg` | `solid` | Set `transparent` for no fill. Use a light/dark pair, or select an explicit theme. |
| `width` | `640` | Layout width from 320 to 1600. The image scales to the available space. |
| `max-length` | `0` | Limit the daily pool by translation grapheme count (Arabic if translation is off). `0` is unlimited. Fixed references are never shortened. |
| `lang` | `en` | Default translation language: `en`, `id`, or `de`. |
| `translation` | by language | `itani`, `sahih`, `pickthall`, or a documented Tanzil edition ID. An explicit edition overrides `lang`. |
| `translation-name` | automatic | Required credit for a custom edition. |
| `show-translation` | `true` | Set `'false'` for Arabic only. |
| `animate` | `true` | Set `'false'` for a static banner. Reduced-motion viewers see the complete text. |
| `title` | `Ayah of the Day` | Header label. |
| `verse` | empty | Select a fixed valid reference, e.g. `'2:282'`. |
| `random` | `false` | Set `'true'` to opt out of deterministic daily selection. |
| `output-path` | `assets/quran-ayah.svg` | Output, or the light output when generating a pair. |
| `dark-output-path` | empty | Optional second output. Both themes are generated from the same verse. |
| `readme-path` | empty | Optional existing README to update with the current verse link and credits. |

The default selection rotates through [39 curated ayahs](src/verses.json) by
UTC day. Same date and inputs yield the same selection. A length limit filters
the pool; it never cuts off text. Custom translations must be supported by
the bundled Latin-script serif font, and must be permitted for your use.

## Rendering and caching

The short example has a compact 640-wide viewBox and expands to the available
README width. Longer verses wrap and grow vertically. Arabic line positions are
measured from the actual ink bounds, including diacritics.

Each SVG embeds a base64 Amiri Quran WOFF subset. The shaped Arabic and italic
serif translation are also rendered as vector paths so no viewer needs fonts to
load. The English typing effect advances one reveal edge across each line;
without motion the full text is visible. The SVG contains no external
resource requests or scripts. Its
`<title>` and `<desc>` preserve the original text and credit.

The example workflow runs daily at **00:17 UTC** and can also run manually.
A new verse appears after the workflow commits; scheduling and image caching can
delay the display. GitHub serves these files, so this Action cannot set its
`Cache-Control` headers. If an old image persists, first verify the latest
workflow and the committed SVG; see [GitHub's Camo troubleshooting](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls#troubleshooting-issues-with-camo).
If fetching fails, the Action errors before writing or replacing the banner.

## Sources and licenses

- **Arabic:** verbatim Tanzil Uthmani text, with the source's copyright notice
  included in generated SVGs. [Tanzil text terms](https://tanzil.net/docs/Text_License).
  Chapter numbers, verse counts and names come from
  [Tanzil's metadata](https://tanzil.net/docs/Quran_Metadata).
- **Translation defaults:** Saheeh International (`en.sahih`), Indonesian Ministry of
  Religious Affairs (`id.indonesian`), or Bubenheim & Elyas (`de.bubenheim`).
  Talal Itani and Pickthall are also available.
  See [Tanzil's translation terms](https://tanzil.net/trans/) and check the
  publisher's permission for your use. Translation text is not machine-translated.
- **Code:** [MIT](LICENSE). This does not apply to the source texts or fonts.
  [Amiri Quran](fonts/AmiriQuran-OFL.txt) and
  [Liberation Serif](fonts/LiberationSerif-LICENSE.txt) have separate font licenses.
  See the [dependency notices](THIRD_PARTY_NOTICES.txt).

## Local development

Node.js 24+ is required to build or generate, not to view the preview.

```sh
npm ci
npm test
npm run build
npm run preview
npm run generate -- --verse 2:282 --theme dark --translation sahih
npm run generate -- --lang id --max-length 180 --palette green-gold
```

`npm run preview` regenerates the self-contained preview using live Tanzil
samples, resets the repository example to 94:5, and writes the example assets.
Commit the rebuilt `dist/` when changing the Action source.
