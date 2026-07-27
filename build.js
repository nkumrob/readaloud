#!/usr/bin/env node
/*
 * Builds one static page per locale from src/app.html + src/locales/*.json.
 *
 *   node build.js                      → writes /index.html, /es/, /fr/, /de/, /ar/, /zh/
 *   node build.js https://example.com  → same, with that origin baked into canonicals
 *
 * Adding a language = adding one JSON file to src/locales. Nothing here is per-language.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ORIGIN = (process.argv[2] || 'https://aloud.app').replace(/\/+$/, '');
const SRC = fs.readFileSync(path.join(ROOT, 'src/app.html'), 'utf8');
const DOC = fs.readFileSync(path.join(ROOT, 'src/doc.html'), 'utf8');
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/site.json'), 'utf8'));

const PUB = (SITE.adsensePublisherId || '').trim();
const ADS_ON = /^ca-pub-\d{10,}$/.test(PUB);
const DOC_PAGES = ['privacy', 'terms', 'about'];

// the font faces live in app.html; reuse them verbatim so the doc pages match
const FONT_FACES = (SRC.match(/@font-face\{[\s\S]*?unicode-range:[^}]+\}/g) || []).join('\n');

const LOCALE_DIR = path.join(ROOT, 'src/locales');
const locales = fs.readdirSync(LOCALE_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, f), 'utf8')))
  .sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.code.localeCompare(b.code)));

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const url = l => ORIGIN + l.path;
const docPath = (l, name) => `${l.path}${name}/`;

// Google's certified CMP is delivered through this same tag; enable the EEA
// message under Privacy & messaging in the AdSense dashboard.
const adsTag = () => ADS_ON
  ? `\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUB}" crossorigin="anonymous"></script>`
  : '';

// fill {{tokens}} from site.json so no policy ships with a stale detail
const site = s => String(s)
  .replace(/\{\{operator\}\}/g, esc(SITE.operator))
  .replace(/\{\{contactEmail\}\}/g, esc(SITE.contactEmail))
  .replace(/\{\{jurisdiction\}\}/g, esc(SITE.jurisdiction))
  .replace(/\{\{effectiveDate\}\}/g, esc(SITE.effectiveDate))
  .replace(/\{\{entity\}\}/g, esc(SITE.entity))
  .replace(/\{\{origin\}\}/g, ORIGIN);

/* ── head ── */
function head(L) {
  const alts = locales.map(l =>
    `<link rel="alternate" hreflang="${l.lang}" href="${url(l)}">`).join('\n');
  return `<title>${esc(L.meta.title)}</title>
<meta name="description" content="${esc(L.meta.description)}">

<!-- Rebuild with your own domain:  node build.js https://your-domain.com -->
<link rel="canonical" href="${url(L)}">
${alts}
<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#08090a" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f2f2ef" media="(prefers-color-scheme: light)">
<meta name="color-scheme" content="dark light">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Aloud">
<meta property="og:locale" content="${L.lang.replace('-', '_')}">
<meta property="og:url" content="${url(L)}">
<meta property="og:title" content="${esc(L.meta.ogTitle)}">
<meta property="og:description" content="${esc(L.meta.ogDescription)}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(L.meta.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(L.meta.ogTitle)}">
<meta name="twitter:description" content="${esc(L.meta.ogDescription)}">
<meta name="twitter:image" content="${ORIGIN}/og.png">

<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2308090a'/%3E%3Cg fill='%23ccff33'%3E%3Crect x='6' y='13' width='2.6' height='6' rx='1.3'/%3E%3Crect x='11' y='9' width='2.6' height='14' rx='1.3'/%3E%3Crect x='16' y='6' width='2.6' height='20' rx='1.3'/%3E%3Crect x='21' y='11' width='2.6' height='10' rx='1.3'/%3E%3C/g%3E%3C/svg%3E">`;
}

/* ── structured data ── */
function schema(L) {
  return `<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': url(L) + '#app',
      name: 'Aloud',
      url: url(L),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any browser with a speech engine (Chrome, Edge, Safari)',
      browserRequirements: 'Requires JavaScript and the Web Speech API',
      description: L.meta.schemaDescription,
      inLanguage: L.lang,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: L.meta.features
    },
    {
      '@type': 'FAQPage',
      '@id': url(L) + '#faq',
      inLanguage: L.lang,
      mainEntity: L.content.faq.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    }
  ]
}, null, 2)}
</script>`;
}

/* ── visible content ── */
function about(L) {
  const c = L.content;
  const sections = c.sections.map(sec => {
    const blocks = sec.blocks.map(b => {
      if (b.p) return `  <p>${b.p}</p>`;
      if (b.ol) return `  <ol>\n${b.ol.map(li => `    <li>${li}</li>`).join('\n')}\n  </ol>`;
      if (b.cards) return `  <div class="modes-grid">\n${b.cards.map(cd =>
        `    <div class="mcard">\n      <b>${esc(cd.tag)}</b>\n      <h3>${esc(cd.h3)}</h3>\n      <p>${cd.p}</p>\n    </div>`
      ).join('\n')}\n  </div>`;
      return '';
    }).join('\n');
    return `  <h2>${esc(sec.h2)}</h2>\n${blocks}`;
  }).join('\n\n');

  const faq = c.faq.map(f =>
    `    <details>\n      <summary>${esc(f.q)}</summary>\n      <p>${esc(f.a)}</p>\n    </details>`
  ).join('\n');

  // a plain crawlable link to every other language
  const picker = locales.filter(l => l.code !== L.code)
    .map(l => `<a href="${l.path}" hreflang="${l.lang}" lang="${l.lang}">${esc(l.name)}</a>`)
    .join('\n    ');

  const docNav = DOC_PAGES
    .map(n => `<a href="${docPath(L, n)}">${esc(L.docs[n].nav)}</a>`).join('\n    ');

  return `<article class="about">
 <div class="about-in">
${sections}

  <h2>${esc(c.faqHeading)}</h2>
  <div class="faq">
${faq}
  </div>
 </div>
</article>

<footer class="sitefoot">
  <span>${esc(c.footer)}</span>
  <nav class="sitenav" aria-label="${esc(c.langLabel)}">
    ${docNav}
  </nav>
  <nav class="langs" aria-label="${esc(c.langLabel)}">
    <span class="langs-label">${esc(c.langLabel)}:</span>
    ${picker}
  </nav>
  <span class="sp"><a href="/sitemap.xml">${esc(c.sitemap)}</a></span>
</footer>`;
}

/* ── privacy / terms / about ── */
function docPage(L, name) {
  const d = L.docs[name];
  const body = d.blocks.map(b => {
    if (b.h2) return `    <h2>${esc(site(b.h2))}</h2>`;
    if (b.p) return `    <p>${site(b.p)}</p>`;
    if (b.note) return `    <div class="note"><p>${site(b.note)}</p></div>`;
    if (b.ul) return `    <ul>\n${b.ul.map(li => `      <li>${site(li)}</li>`).join('\n')}\n    </ul>`;
    return '';
  }).join('\n');

  const nav = [`<a href="${L.path}">${esc(L.docs.backNav)}</a>`]
    .concat(DOC_PAGES.filter(n => n !== name).map(n => `<a href="${docPath(L, n)}">${esc(L.docs[n].nav)}</a>`))
    .join('\n    ');

  const langs = locales.filter(l => l.code !== L.code)
    .map(l => `<a href="${docPath(l, name)}" hreflang="${l.lang}" lang="${l.lang}">${esc(l.name)}</a>`)
    .join('\n    ');

  const alts = locales.map(l =>
    `<link rel="alternate" hreflang="${l.lang}" href="${ORIGIN + docPath(l, name)}">`).join('\n');

  const head = `<title>${esc(d.title)} — Aloud</title>
<meta name="description" content="${esc(d.description)}">
<link rel="canonical" href="${ORIGIN + docPath(L, name)}">
${alts}
<link rel="alternate" hreflang="x-default" href="${ORIGIN + docPath(locales[0], name)}">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#08090a" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2308090a'/%3E%3Cg fill='%23ccff33'%3E%3Crect x='6' y='13' width='2.6' height='6' rx='1.3'/%3E%3Crect x='11' y='9' width='2.6' height='14' rx='1.3'/%3E%3Crect x='16' y='6' width='2.6' height='20' rx='1.3'/%3E%3Crect x='21' y='11' width='2.6' height='10' rx='1.3'/%3E%3C/g%3E%3C/svg%3E">${adsTag()}`;

  const depth = docPath(L, name).split('/').filter(Boolean).length;
  return DOC
    .replace('{{lang}}', L.lang).replace('{{dir}}', L.dir)
    .replace('{{home}}', L.path)
    .replace('{{footer}}', esc(L.content.footer))
    .replace('{{sitemap}}', esc(L.content.sitemap))
    .replace('<!--HEAD-->', head)
    .replace('<!--FONTS-->', FONT_FACES.replace(/FONTBASE/g, '../'.repeat(depth) + 'fonts/'))
    .replace('<!--NAV-->', nav)
    .replace('<!--DOC-->', `    <h1>${esc(d.title)}</h1>\n    <span class="stamp">${esc(site(d.stamp))}</span>\n${body}`)
    .replace('<!--LANGS-->', langs);
}

/* ── emit ── */
let written = [];
for (const L of locales) {
  // fonts resolve from the page's own depth, so file:// and subdirectories both work
  const fontBase = L.path === '/' ? 'fonts/' : '../fonts/';
  const page = SRC
    .replace(/FONTBASE/g, fontBase)
    .replace('{{lang}}', L.lang)
    .replace('{{dir}}', L.dir)
    .replace('<!--HEAD-->', head(L))
    .replace('<!--SCHEMA-->', schema(L))
    .replace('<!--ABOUT-->', about(L))
    .replace('<!--I18N-->',
      `<script id="i18n" type="application/json">${
        JSON.stringify({ ui: L.ui, a11y: L.a11y, guide: L.guide, sample: L.sample })
          .replace(/</g, '\\u003c')
      }</script>`)
    // the visually-hidden half of the h1, per locale
    .replace('&nbsp;— free text to speech, teleprompter and dictation in your browser', esc(L.meta.h1sr))
    .replace(' — free text to speech, teleprompter and dictation in your browser', esc(L.meta.h1sr));

  const out = L.path === '/'
    ? path.join(ROOT, 'index.html')
    : path.join(ROOT, L.path.replace(/^\/|\/$/g, ''), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page.replace('</head>', adsTag() + '\n</head>'));
  written.push(path.relative(ROOT, out));

  for (const name of DOC_PAGES) {
    const dout = path.join(ROOT, docPath(L, name).replace(/^\/|\/$/g, ''), 'index.html');
    fs.mkdirSync(path.dirname(dout), { recursive: true });
    fs.writeFileSync(dout, docPage(L, name));
    written.push(path.relative(ROOT, dout));
  }
}

/* ── sitemap with per-URL alternates ── */
const entry = (loc, alts, priority) => `  <url>
    <loc>${loc}</loc>
${alts.map(a => `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${alts[0].href}"/>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;

const urls = [
  ...locales.map(L => entry(url(L), locales.map(l => ({ lang: l.lang, href: url(l) })), L.path === '/' ? '1.0' : '0.8')),
  ...DOC_PAGES.flatMap(name => locales.map(L =>
    entry(ORIGIN + docPath(L, name), locales.map(l => ({ lang: l.lang, href: ORIGIN + docPath(l, name) })), '0.3')))
];

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`);

/* ads.txt only exists once there is a real publisher id to put in it */
const adsPath = path.join(ROOT, 'ads.txt');
if (ADS_ON) fs.writeFileSync(adsPath, `google.com, ${PUB.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
else if (fs.existsSync(adsPath)) fs.unlinkSync(adsPath);

const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')
  .replace(/^Sitemap: .*$/m, `Sitemap: ${ORIGIN}/sitemap.xml`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots);

console.log(`origin  ${ORIGIN}`);
console.log(`locales ${locales.map(l => l.code).join(', ')}`);
console.log(`pages   ${written.length} (${locales.length} app + ${written.length - locales.length} doc)`);
console.log(`ads     ${ADS_ON ? PUB + ' — tag injected, ads.txt written' : 'off (no publisher id in src/site.json)'}`);
console.log(`sitemap ${urls.length} urls`);

const unset = Object.entries(SITE)
  .filter(([k, v]) => typeof v === 'string' && /^SET-/.test(v))
  .map(([k]) => k);
if (unset.length) console.warn(`\n!  src/site.json still has placeholders: ${unset.join(', ')}` +
  `\n   The legal pages will show them verbatim. Fill them in before applying to AdSense.`);
