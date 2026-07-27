# Aloud

One script, three modes, entirely in the browser.

- **LISTEN** — text to speech with read-along highlighting. The machine speaks, you listen.
- **PROMPT** — teleprompter. You speak; the script scrolls at your pace.
- **DICTATE** — speech to text. You speak; your words become the script.

No server, no account, no API key. It runs on the Web Speech API already built into
the browser, so listening and prompting cost nothing and work offline.

## Build

The site is six static pages generated from one template.

```
src/app.html          the template
src/locales/*.json    en · es · fr · de · ar · zh
build.js              generates the pages, sitemap and hreflang alternates

node build.js https://your-domain.com
```

Output: `index.html`, `es/`, `fr/`, `de/`, `ar/`, `zh/` and `sitemap.xml`.
The origin you pass is baked into canonicals, Open Graph tags, JSON-LD and the sitemap,
so **rebuild after pointing a real domain at it**.

Adding a language is one JSON file in `src/locales/` — nothing in `build.js` is
per-language.

## Notes

- **Fonts are self-hosted** (Archivo, DM Mono — SIL OFL 1.1) in `fonts/`. No request
  reaches Google, so no visitor IP is disclosed. Re-download to pick up font updates.
- **Language handling.** Right-to-left scripts lay out RTL. Chinese, Japanese, Korean and
  Thai are counted and paced per character, and the teleprompter dial switches from words
  per minute to characters per minute. Speech-duration estimates use per-language
  character rates.
- **Privacy.** Scripts are kept in `localStorage` only, and the footer toggle switches
  that off and deletes what is stored. Dictation is the exception: Chrome and Edge stream
  microphone audio to their own servers to transcribe it.
- **Analytics and ads** are both switches in `src/site.json`. `analyticsId` injects GA4 with
  Consent Mode v2 (ad and analytics storage denied by default across the EEA, UK and
  Switzerland, granted elsewhere); `adsensePublisherId` injects the AdSense tag and writes
  `ads.txt`. Changing either means the privacy policy in all six locales must be changed to
  match — it names exactly what is loaded.
- Audio cannot be exported — the browser speech engine exposes no recordable stream.

## Licence

Code: MIT. Fonts: SIL Open Font License 1.1.
