#!/usr/bin/env node
// Builds the compliance site into dist/. No dependencies, Node 18+.
//   node build.mjs           build, warn about placeholders
//   node build.mjs --strict  fail if any TODO placeholder remains (run before printing labels)

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const STRICT = process.argv.includes('--strict');

const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isTodo = (v) => typeof v === 'string' && /^\s*TODO\b/i.test(v);
const todoMark = (v) => `<mark class="todo">${esc(v)}</mark>`;
const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

function findTodos(value, trail = '', out = []) {
  if (isTodo(value)) out.push(trail);
  else if (Array.isArray(value)) value.forEach((v, i) => findTodos(v, `${trail}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) findTodos(v, trail ? `${trail}.${k}` : k, out);
  }
  return out;
}

// A field is either a plain string or { en: "...", fr: "..." }. Falls back to the default language.
function pick(field, lang, fallback) {
  if (field == null) return null;
  if (typeof field !== 'object') return { text: String(field), lang };
  if (field[lang] != null) return { text: String(field[lang]), lang };
  if (field[fallback] != null) return { text: String(field[fallback]), lang: fallback };
  return null;
}

function show(value, lang) {
  if (!value) return '';
  const inner = isTodo(value.text) ? todoMark(value.text) : esc(value.text);
  return value.lang !== lang ? `<span lang="${value.lang}">${inner}</span>` : inner;
}

const num = (n, lang) => (isTodo(n) ? todoMark(n) : new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(Number(n)));
const normalizeCode = (c) => String(c).toUpperCase().replace(/\s+/g, '').replace(/^([A-Z/]+)(\d+)$/, '$1 $2');

function validGtin(g) {
  if (!/^(\d{8}|\d{12,14})$/.test(g)) return false;
  const digits = g.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function validate(p, file, site, i18n) {
  const errors = [];
  const def = site.defaultLanguage;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug ?? '')) errors.push('"slug" must use lowercase letters, numbers and single hyphens');
  if (`${p.slug}.json` !== file) errors.push(`file name must match slug (expected ${p.slug}.json)`);
  for (const key of ['name', 'legalName', 'abv', 'volumeCl', 'allergens', 'packaging', 'operator']) {
    if (p[key] == null) errors.push(`missing "${key}"`);
  }
  if (p.abv != null && !isTodo(p.abv) && !(Number(p.abv) > 0 && Number(p.abv) < 100)) errors.push('"abv" must be a number between 0 and 100');
  if (p.volumeCl != null && !isTodo(p.volumeCl) && !(Number(p.volumeCl) > 0)) errors.push('"volumeCl" must be a positive number');
  if (p.gtin != null && !validGtin(String(p.gtin))) errors.push('"gtin" is not a valid GTIN (wrong length or check digit)');
  if (p.energy != null && !(Number(p.energy.kj) > 0 && Number(p.energy.kcal) > 0)) errors.push('"energy" needs numeric "kj" and "kcal", or set it to null');
  (p.packaging ?? []).forEach((item, i) => {
    if (!i18n.labels[def].parts[item.part]) errors.push(`packaging[${i}].part "${item.part}" is not one of: ${Object.keys(i18n.labels[def].parts).join(', ')}`);
    if (!isTodo(item.code) && !i18n.materials[normalizeCode(item.code ?? '')]) errors.push(`packaging[${i}].code "${item.code}" is not listed in src/i18n.json materials`);
  });
  return errors;
}

function checkTranslations(site, i18n) {
  const errors = [];
  const base = i18n.labels[site.defaultLanguage];
  const keysOf = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  const baseKeys = keysOf(base);
  for (const lang of site.languages) {
    const labels = i18n.labels[lang];
    if (!labels) { errors.push(`src/i18n.json has no labels for "${lang}"`); continue; }
    const have = new Set(keysOf(labels));
    for (const key of baseKeys) if (!have.has(key)) errors.push(`src/i18n.json "${lang}" is missing "${key}"`);
  }
  for (const [code, m] of Object.entries(i18n.materials)) {
    for (const lang of site.languages) if (!m.names[lang]) errors.push(`material "${code}" has no "${lang}" name`);
    if (!base.bins[m.family]) errors.push(`material "${code}" has unknown family "${m.family}"`);
  }
  return errors;
}

const LANG_SCRIPT = `(function () {
  var sections = [].slice.call(document.querySelectorAll('[data-lang]'));
  var buttons = [].slice.call(document.querySelectorAll('[data-set-lang]'));
  var nav = document.querySelector('.langs');
  var available = sections.map(function (s) { return s.getAttribute('data-lang'); });
  function showLang(code) {
    sections.forEach(function (s) { s.hidden = s.getAttribute('data-lang') !== code; });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === code)); });
    var active = sections[available.indexOf(code)];
    document.documentElement.lang = code;
    if (active && active.getAttribute('data-title')) document.title = active.getAttribute('data-title');
  }
  var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  var chosen = available[0];
  for (var i = 0; i < prefs.length; i++) {
    var code = String(prefs[i] || '').slice(0, 2).toLowerCase();
    if (available.indexOf(code) !== -1) { chosen = code; break; }
  }
  var fromUrl = /[?&]lang=([a-z]{2})\\b/.exec(location.search);
  if (fromUrl && available.indexOf(fromUrl[1]) !== -1) chosen = fromUrl[1];
  buttons.forEach(function (b) { b.addEventListener('click', function () { showLang(b.getAttribute('data-set-lang')); }); });
  if (nav) nav.hidden = false;
  showLang(chosen);
})();`;

function shell({ lang, title, css, body, script = '', canonical = '', description = '' }) {
  const csp = [
    "default-src 'none'",
    `style-src ${sha256(css)}`,
    `script-src ${script ? sha256(script) : "'none'"}`,
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
${description ? `<meta name="description" content="${esc(description)}">\n` : ''}${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="hue" aria-hidden="true"></div>
<div class="wrap">
${body}
</div>
${script ? `<script>${script}</script>\n` : ''}</body>
</html>
`;
}

function renderProduct(p, site, i18n, isDraft, css) {
  const def = site.defaultLanguage;
  const brand = isTodo(site.brand) ? todoMark(site.brand) : esc(site.brand);
  const brandText = isTodo(site.brand) ? '' : ` | ${site.brand}`;

  const nav = site.languages.length > 1
    ? `<nav class="langs" aria-label="${esc(i18n.labels[def].language)}" hidden>${site.languages
        .map((l) => `<button type="button" lang="${l}" data-set-lang="${l}" aria-pressed="${l === def}">${esc(i18n.labels[l].languageName)}</button>`)
        .join('')}</nav>`
    : '';

  const sections = site.languages.map((lang) => {
    const L = i18n.labels[lang];
    const t = (field) => show(pick(field, lang, def), lang);
    const plain = (v) => show({ text: v, lang }, lang);

    const volume = isTodo(p.volumeCl) ? todoMark(p.volumeCl) : `${num(p.volumeCl, lang)} cl${p.eMark ? ' ℮' : ''}`;
    const abv = isTodo(p.abv) ? todoMark(p.abv) : `${num(p.abv, lang)} % vol`;

    const packaging = p.packaging.map((item) => {
      const code = isTodo(item.code) ? null : normalizeCode(item.code);
      const material = code ? i18n.materials[code] : null;
      const matHtml = material ? `${esc(material.names[lang])} <code>${esc(code)}</code>` : plain(item.code);
      const disposal = item.disposal ? t(item.disposal) : material ? esc(L.bins[material.family]) : '';
      return `<li><span class="part">${esc(L.parts[item.part])}</span><span class="mat">${matHtml}</span>${disposal ? `<span class="bin">${disposal}</span>` : ''}</li>`;
    }).join('');

    const op = p.operator;
    const email = isTodo(op.email) ? todoMark(op.email) : `<a href="mailto:${esc(op.email)}">${esc(op.email)}</a>`;

    return `<div data-lang="${lang}" lang="${lang}" data-title="${esc(`${p.name} | ${L.pageTitle}${brandText}`)}"${lang === def ? '' : ' hidden'}>
${isDraft ? `<p class="draft" role="note">${esc(L.draft)}</p>` : ''}
<h1>${esc(p.name)}</h1>
<p class="legal">${t(p.legalName)}</p>
<dl class="facts">
<div><dt>${esc(L.alcohol)}</dt><dd>${abv}</dd></div>
<div><dt>${esc(L.volume)}</dt><dd>${volume}</dd></div>
</dl>
${p.ingredients != null ? `<div class="block"><h2>${esc(L.ingredients)}</h2><p>${t(p.ingredients)}</p></div>` : ''}
<div class="block"><h2>${esc(L.allergens)}</h2><p>${t(p.allergens)}</p></div>
${p.energy != null ? `<div class="block"><h2>${esc(L.energy)}</h2><p>${num(p.energy.kj, lang)} kJ / ${num(p.energy.kcal, lang)} kcal</p></div>` : ''}
<div class="block"><h2>${esc(L.packaging)}</h2><ul class="pack">${packaging}</ul><p class="note">${esc(L.checkLocal)}</p></div>
<div class="block"><h2>${esc(L.operator)}</h2><address>${plain(op.name)}<br>${op.address.map(plain).join('<br>')}<br>${email}</address></div>
<p class="resp">${esc(L.responsible)}</p>
<p class="foot">${esc(L.privacy)}</p>
</div>`;
  }).join('\n');

  return shell({
    lang: def,
    title: `${p.name} | ${i18n.labels[def].pageTitle}${brandText}`,
    description: `${i18n.labels[def].pageTitle}: ${p.name}`,
    canonical: `${site.baseUrl}/${p.slug}/`,
    css,
    script: site.languages.length > 1 ? LANG_SCRIPT : '',
    body: `<header class="top"><p class="brand">${brand}</p>${nav}</header>\n${sections}`,
  });
}

function renderIndex(products, site, css) {
  const brand = isTodo(site.brand) ? todoMark(site.brand) : esc(site.brand);
  const list = products.map((p) => `<li><a href="/${p.slug}/">${esc(p.name)}</a></li>`).join('');
  return shell({
    lang: 'en', title: 'Product information', css, canonical: `${site.baseUrl}/`,
    body: `<header class="top"><p class="brand">${brand}</p></header>
<h1>Product information</h1>
<p class="legal">Scan the code on your bottle, or choose a product.</p>
<ul class="products">${list}</ul>
<p class="foot"><a href="${esc(site.homepage)}">${esc(new URL(site.homepage).host)}</a></p>`,
  });
}

function render404(site, css) {
  return shell({
    lang: 'en', title: 'Page not found', css,
    body: `<h1>Page not found</h1>
<p class="legal">This product page doesn't exist. Scan the code on your bottle again, or see all products below.</p>
<p><a href="/">All products</a></p>
<p class="foot"><a href="${esc(site.homepage)}">${esc(new URL(site.homepage).host)}</a></p>`,
  });
}

async function write(rel, content) {
  const target = path.join(DIST, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function main() {
  const site = await readJson('site.json');
  const i18n = await readJson('src/i18n.json');
  const css = (await readFile(path.join(ROOT, 'src/style.css'), 'utf8')).trim();

  const errors = checkTranslations(site, i18n);
  const files = (await readdir(path.join(ROOT, 'products'))).filter((f) => f.endsWith('.json')).sort();
  const products = [];
  const gtins = new Map();
  for (const file of files) {
    const p = await readJson(`products/${file}`);
    errors.push(...validate(p, file, site, i18n).map((e) => `products/${file}: ${e}`));
    if (p.gtin != null) {
      const g14 = String(p.gtin).padStart(14, '0');
      if (gtins.has(g14)) errors.push(`products/${file}: gtin already used by ${gtins.get(g14)}`);
      gtins.set(g14, file);
    }
    products.push(p);
  }
  if (errors.length) {
    console.error(`Build failed:\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }

  const siteTodos = findTodos(site).map((t) => `site.json: ${t}`);
  await rm(DIST, { recursive: true, force: true });

  const allTodos = [...siteTodos];
  for (const p of products) {
    const todos = findTodos(p).map((t) => `products/${p.slug}.json: ${t}`);
    allTodos.push(...todos);
    const html = renderProduct(p, site, i18n, todos.length + siteTodos.length > 0, css);
    await write(`${p.slug}/index.html`, html);
    // GS1 Digital Link path, e.g. /01/05012345678900/, served alongside the readable URL.
    if (p.gtin != null) await write(`01/${String(p.gtin).padStart(14, '0')}/index.html`, html);
  }

  await write('index.html', renderIndex(products, site, css));
  await write('404.html', render404(site, css));
  await write('CNAME', `${new URL(site.baseUrl).host}\n`);
  await write('.nojekyll', '');

  console.log(`Built ${products.length} product page(s) into dist/: ${products.map((p) => `/${p.slug}/`).join(', ')}`);
  if (allTodos.length) {
    const message = `${allTodos.length} placeholder(s) still to fill in (pages show a draft notice):\n  - ${allTodos.join('\n  - ')}`;
    if (STRICT) { console.error(`Strict check failed. ${message}`); process.exit(1); }
    console.warn(message);
  } else {
    console.log('No placeholders left.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
