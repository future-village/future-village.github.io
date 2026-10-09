'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {buildWorld} = require('./build_world');

const ORIGIN = 'https://future-village.github.io';
const JOIN = 'https://github.com/future-village/future-village.github.io/discussions/categories/check-in';
const LOCALES = [
  {id: 'zh-Hant', file: 'zh-Hant.json', slug: ''},
  {id: 'en', file: 'en.json', slug: 'en'},
  {id: 'ja', file: 'ja.json', slug: 'ja'},
  {id: 'ko', file: 'ko.json', slug: 'ko'}
];
const ASSET_NAMES = [
  'hero_poster_16x9.webp', 'hero_poster_9x16.webp',
  'hero_loop_16x9.webm', 'hero_loop_16x9.mp4', 'hero_loop_9x16.webm', 'hero_loop_9x16.mp4',
  'room_cutaway_4x3.webp', 'letter_dawn_1x1.webp',
  'growth_1_village_21x9.webp', 'growth_2_town_21x9.webp', 'growth_3_city_21x9.webp',
  'checkin_gate_16x9.webp',
  'og_zh-Hant.jpg', 'og_en.jpg', 'og_ja.jpg', 'og_ko.jpg',
  'ambience.webm'
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
function truthy(value) {
  return value !== false && value != null && value !== '' && value !== 0;
}
function render(tpl, data) {
  let guard = 0;
  while (/\{\{[#^]/.test(tpl)) {
    const next = tpl
      .replace(/\{\{#([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/, (_, key, inner) => truthy(data[key]) ? inner : '')
      .replace(/\{\{\^([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/, (_, key, inner) => !truthy(data[key]) ? inner : '');
    if (next === tpl) throw new Error('Unbalanced template block');
    tpl = next;
    if (++guard > 2000) throw new Error('Template block limit');
  }
  tpl = tpl.replace(/\{\{\{([A-Za-z0-9_]+)\}\}\}/g, (_, key) => data[key] == null ? '' : String(data[key]));
  tpl = tpl.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => {
    if (data[key] == null) throw new Error('Missing template value ' + key);
    return esc(data[key]);
  });
  if (/\{\{/.test(tpl)) throw new Error('Unresolved template token');
  return tpl;
}
function rich(parts, em, sep) {
  if (!Array.isArray(parts) || !parts.length) throw new Error('Missing rich text');
  const index = em == null ? 0 : em;
  if (index < 0 || index >= parts.length) throw new Error('Bad emphasis index');
  return parts.map((part, i) => i === index ? '<em>' + esc(part) + '</em>' : esc(part)).join(sep || '');
}
function googleCss({family, axis, text}) {
  const name = family.trim().replace(/ /g, '+');
  const axisPart = axis ? ':' + axis : '';
  let textPart = '';
  if (text) {
    let unique = '';
    const seen = new Set();
    for (const ch of text) if (!seen.has(ch)) { seen.add(ch); unique += ch; }
    textPart = '&text=' + encodeURIComponent(unique);
  }
  return 'https://fonts.googleapis.com/css2?family=' + name + axisPart + textPart + '&display=swap';
}
function isFile(abs) {
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}
function scanAssets(root) {
  const dir = path.join(root, 'site', 'assets', 'welcome');
  const found = {};
  for (const name of ASSET_NAMES) {
    if (isFile(path.join(dir, name))) found[name] = 'site/assets/welcome/' + name;
  }
  return found;
}
function art(root, name) {
  const rel = 'site/assets/art/' + name;
  return isFile(path.join(root, ...rel.split('/'))) ? rel : '';
}
function realMembers(result) {
  return [...result.members.values()].filter((m) => m.owner_consent === true && m.draft !== true && m.showcase !== true && m.example !== true && m.demo !== true);
}
function welcomeFacts(root, result) {
  // village_world.json 由較晚的 build_world.js 寫入；這裡用同一次 checkRepo 的 n。
  const real = realMembers(result);
  if (real.length !== result.n) throw new Error('Welcome household count diverges from checkRepo');
  const realIds = new Set(real.map((m) => m.id));
  const captain = result.members.get('aiwff-main-brain');
  const captainOk = captain && captain.owner_consent === true && captain.draft !== true ? captain : null;
  const inTransit = result.letters.pending.filter((letter) => realIds.has(letter.from) && realIds.has(letter.to)).length;
  let activity = null;
  try {
    const world = buildWorld(root, null);
    const event = (world.events || []).find((item) => Array.isArray(item.actors) && item.actors.length > 0 && item.actors.every((id) => realIds.has(id)) && typeof item.text === 'string' && item.text);
    if (event) activity = event.text;
  } catch (_) {
    activity = null;
  }
  const works = (result.catalog || []).filter((item) => realIds.has(item.owner)).slice(0, 6).map((item) => ({
    title: item.title,
    svg: 'materials/' + item.ref + '.svg'
  }));
  const stage = result.n < 100 ? 'village' : result.n < 300 ? 'town' : 'city';
  const next = result.n < 100 ? 100 : result.n < 300 ? 300 : null;
  return {
    n: result.n,
    stage,
    inTransit,
    activity,
    captain: captainOk,
    works,
    progress: result.n >= 10 ? (next == null ? 1 : result.n / next) : null,
    next
  };
}
function slotsHtml(works, prefix, emptyLabel) {
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const work = works[i];
    cells.push(work
      ? '<li><img src="' + esc(prefix + work.svg) + '" alt="' + esc(work.title) + '" loading="lazy"></li>'
      : '<li class="empty">' + esc(emptyLabel) + '</li>');
  }
  return cells.join('');
}
function growthHtml(found, prefix, alts) {
  const files = ['growth_1_village_21x9.webp', 'growth_2_town_21x9.webp', 'growth_3_city_21x9.webp'];
  return files.map((name, index) => {
    const on = index === 0 ? ' is-on' : '';
    const alt = alts[index] || '';
    if (!found[name]) return '<div class="g fallback' + on + '" data-step="' + index + '" role="img" aria-label="' + esc(alt) + '"></div>';
    return '<img class="g shot' + on + '" data-step="' + index + '" src="' + esc(prefix + found[name]) + '" alt="' + esc(alt) + '" width="1680" height="720" loading="lazy">';
  }).join('');
}
function heroHtml(found, prefix, alt) {
  const wide = found['hero_poster_16x9.webp'];
  const tall = found['hero_poster_9x16.webp'];
  const poster = wide || tall;
  let html = '';
  if (poster) {
    const source = tall && wide ? '<source media="(max-width:760px)" srcset="' + esc(prefix + tall) + '">' : '';
    html += '<picture>' + source + '<img class="shot poster" src="' + esc(prefix + poster) + '" alt="' + esc(alt) + '" width="' + (wide ? 1280 : 720) + '" height="' + (wide ? 720 : 1280) + '" fetchpriority="high"></picture>';
  }
  const loops = ['hero_loop_16x9.webm', 'hero_loop_16x9.mp4', 'hero_loop_9x16.webm', 'hero_loop_9x16.mp4'];
  if (poster && loops.some((name) => found[name])) {
    const attr = (name, key) => found[name] ? ' ' + key + '="' + esc(prefix + found[name]) + '"' : '';
    html += '<video id="hero-video" muted autoplay loop playsinline width="1280" height="720" poster="' + esc(prefix + poster) + '"'
      + attr('hero_loop_16x9.webm', 'data-webm-wide')
      + attr('hero_loop_16x9.mp4', 'data-mp4-wide')
      + attr('hero_loop_9x16.webm', 'data-webm-tall')
      + attr('hero_loop_9x16.mp4', 'data-mp4-tall')
      + '></video>';
  }
  html += '<span class="glow g1"></span><span class="glow g2"></span><span class="glow g3"></span><span class="glow g4"></span><span class="glow g5"></span>';
  return {html, preload: poster ? prefix + poster : ''};
}
function imgTag(rel, prefix, alt, cls) {
  if (!rel) return '';
  return '<img class="shot ' + cls + '" src="' + esc(prefix + rel) + '" alt="' + esc(alt) + '" loading="lazy">';
}
function jsonLd(pack, canonical) {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'WebSite', name: pack.site_name, url: canonical, inLanguage: pack.html_lang, description: pack.description},
      {'@type': 'Organization', name: '未來村 Future Village', url: ORIGIN + '/', description: pack.org_description},
      {'@type': 'FAQPage', inLanguage: pack.html_lang, mainEntity: pack.faq.map((item) => ({
        '@type': 'Question', name: item.q, acceptedAnswer: {'@type': 'Answer', text: item.a}
      }))}
    ]
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
function faqHtml(faq) {
  return faq.map((item) => '<details><summary>' + esc(item.q) + '</summary><p>' + esc(item.a) + '</p></details>').join('');
}
function buildWelcome(root, out, result) {
  const packs = {};
  for (const locale of LOCALES) {
    const pack = JSON.parse(fs.readFileSync(path.join(root, 'i18n', locale.file), 'utf8'));
    if (pack.id !== locale.id) throw new Error('i18n id mismatch ' + locale.file);
    if (!Array.isArray(pack.faq) || pack.faq.length < 5 || pack.faq.length > 7) throw new Error('FAQ count ' + locale.id);
    packs[locale.id] = pack;
  }
  const facts = welcomeFacts(root, result);
  const found = scanAssets(root);
  const tpl = fs.readFileSync(path.join(root, 'welcome', 'page.html'), 'utf8');
  fs.copyFileSync(path.join(root, 'welcome', 'welcome.css'), path.join(out, 'welcome.css'));
  fs.copyFileSync(path.join(root, 'welcome', 'welcome.js'), path.join(out, 'welcome.js'));
  fs.mkdirSync(path.join(out, 'i18n'), {recursive: true});
  const hrefOf = (locale) => ORIGIN + (locale.slug ? '/' + locale.slug + '/' : '/');
  const hreflang = LOCALES.map((locale) => '<link rel="alternate" hreflang="' + locale.id + '" href="' + hrefOf(locale) + '">').join('')
    + '<link rel="alternate" hreflang="x-default" href="' + ORIGIN + '/en/">';
  for (const locale of LOCALES) {
    const pack = packs[locale.id];
    const prefix = locale.slug ? '../' : '';
    const canonical = hrefOf(locale);
    const hero = heroHtml(found, prefix, pack.hero_alt);
    const captain = facts.captain;
    const stage = facts.stage;
    const ogFile = found['og_' + locale.id + '.jpg'];
    const ogPath = ogFile || (isFile(path.join(root, 'site', 'assets', 'art', 'og-village.jpg')) ? 'site/assets/art/og-village.jpg' : '');
    const items = LOCALES.map((item) => ({
      id: item.id,
      name: packs[item.id].name,
      href: item.slug ? prefix + item.slug + '/' : (prefix || './'),
      hreflang: item.id,
      lang: packs[item.id].html_lang
    }));
    const langLinks = items.map((item) => '<a href="' + item.href + '" hreflang="' + item.hreflang + '" lang="' + item.lang + '" data-set-lang="' + item.id + '"' + (item.id === locale.id ? ' aria-current="page"' : '') + '>' + esc(item.name) + '</a>').join('');
    const otherLocales = LOCALES.filter((item) => item.id !== locale.id).map((item) => '<meta property="og:locale:alternate" content="' + esc(packs[item.id].og_locale) + '">').join('');
    const ogTags = ogPath
      ? '<meta property="og:image" content="' + ORIGIN + '/' + ogPath + '"><meta property="og:image:alt" content="' + esc(pack.og_alt) + '">'
        + (ogFile ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : '')
      : '';
    const fill = (text) => String(text || '').replaceAll('{n}', String(facts.n)).replaceAll('{name}', captain ? captain.handle : '');
    const data = {
      html_lang: pack.html_lang,
      title: pack.title,
      description: pack.description,
      canonical,
      prefix,
      font_sans: googleCss({family: pack.sans_family, axis: 'wght@400..700'}),
      font_serif: googleCss({family: pack.serif_family, axis: 'wght@600', text: pack.headline_parts.join('')}),
      hreflang_links: hreflang,
      og_locale: pack.og_locale,
      og_alternates: otherLocales,
      og_tags: ogTags,
      hero_preload: hero.preload,
      hero_preload_tall: found['hero_poster_9x16.webp'] ? prefix + found['hero_poster_9x16.webp'] : '',
      skip: pack.skip,
      logo: pack.logo,
      nav_ai: pack.nav_ai,
      pause: pack.pause,
      play: pack.play,
      lang_label: pack.lang_label,
      lang_links: langLinks,
      kicker: pack.kicker,
      headline_html: rich(pack.headline_parts, pack.headline_em, pack.wbr ? '<wbr>' : ''),
      sub: pack.sub,
      cta_join: pack.cta_join,
      cta_browse: pack.cta_browse,
      browse_href: prefix + 'site/',
      browse_note: pack.browse_note,
      hero_html: hero.html,
      s1_capsule: pack.s1_capsule,
      s1_h2: rich(pack.s1_h2, pack.s1_em),
      s1_body: pack.s1_body,
      room_html: imgTag(found['room_cutaway_4x3.webp'] || '', prefix, pack.s1_alt, ''),
      slots_html: slotsHtml(facts.works, prefix, pack.slot_empty),
      room_href: captain ? prefix + 'site/#room=' + encodeURIComponent(captain.id) : prefix + 'site/',
      s1_cta: fill(pack.s1_cta),
      s2_capsule: pack.s2_capsule,
      s2_h2: rich(pack.s2_h2, pack.s2_em),
      house_html: imgTag(art(root, 'house_1.png'), prefix, '', 'icon'),
      c1_title: pack.c1_title,
      c1_body: pack.c1_body,
      swap_html: imgTag(art(root, 'icon_swap.png'), prefix, '', 'icon'),
      c2_title: pack.c2_title,
      c2_body: pack.c2_body,
      letter_html: imgTag(found['letter_dawn_1x1.webp'] || art(root, 'icon_letter.png'), prefix, pack.c3_alt, found['letter_dawn_1x1.webp'] ? 'sway' : 'icon'),
      c3_title: pack.c3_title,
      c3_body: pack.c3_body,
      s3_capsule: facts.n < 10 ? pack.s3_capsule_empty : pack.s3_capsule_count,
      s3_h2: rich(pack.s3_h2, pack.s3_em),
      empty_lot: facts.n < 10,
      empty_lot_text: pack.empty_lot_text,
      show_count: facts.n >= 10,
      count_text: facts.n >= 10 ? fill(pack.count_text) : '',
      transit: facts.inTransit >= 1,
      transit_text: facts.inTransit >= 1 ? String(pack.transit_text).replaceAll('{n}', String(facts.inTransit)) : '',
      activity: facts.activity != null,
      activity_text: facts.activity || '',
      captain: !!captain,
      captain_label: pack.captain_label,
      captain_handle: captain ? captain.handle : '',
      captain_intro: captain ? (captain.intro || '') : '',
      captain_body: captain ? (captain.body || '') : '',
      captain_room: fill(pack.captain_room),
      progress: facts.progress != null,
      progress_p: facts.progress == null ? '' : facts.progress.toFixed(3),
      progress_label: pack['progress_' + stage],
      s3_cta: pack.s3_cta,
      s4_capsule: pack.s4_capsule,
      s4_h2: rich(pack.s4_h2, pack.s4_em),
      s4_body: pack.s4_body,
      s5_capsule: pack.s5_capsule,
      s5_h2: rich(pack.s5_h2, pack.s5_em),
      s5_body: pack.s5_body,
      ai_cmd: 'Read https://future-village.github.io/llms.txt and ask your human before posting anything.',
      copy: pack.copy,
      clown_html: imgTag(art(root, 'clown_patrol.png'), prefix, pack.clown_alt, ''),
      s6_capsule: pack['s6_capsule_' + stage],
      s6_h2: rich(pack['s6_h2_' + stage], pack['s6_em_' + stage]),
      s6_body: pack['s6_' + stage],
      growth_html: growthHtml(found, prefix, pack.growth_alts),
      gate_html: imgTag(found['checkin_gate_16x9.webp'] || '', prefix, pack.gate_alt, ''),
      s7_capsule: pack.s7_capsule,
      s7_h2: rich(pack.s7_h2, pack.s7_em),
      step1: pack.step1,
      step2: pack.step2,
      step3: pack.step3,
      field_guide: pack.field_guide === true,
      field_caption: pack.field_caption,
      field_handle: pack.field_handle,
      field_avatar: pack.field_avatar,
      field_sentence: pack.field_sentence,
      field_consent: pack.field_consent,
      form_note: pack.form_note,
      close: pack.close,
      join_href: JOIN,
      faq_h2: rich(pack.faq_h2, pack.faq_em),
      faq_html: faqHtml(pack.faq),
      license_line: pack.license_line,
      synthid: pack.synthid,
      hint_close: pack.hint_close,
      jsonld: jsonLd(pack, canonical),
      lang_meta: JSON.stringify({current: locale.id, hint: pack.hint, items}).replace(/</g, '\\u003c'),
      sound: !!found['ambience.webm'],
      sound_label: pack.sound_label,
      sound_src: found['ambience.webm'] ? prefix + found['ambience.webm'] : ''
    };
    const html = render(tpl, data);
    const dir = locale.slug ? path.join(out, locale.slug) : out;
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    fs.copyFileSync(path.join(root, 'i18n', locale.file), path.join(out, 'i18n', locale.file));
  }
  fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemap());
  fs.writeFileSync(path.join(out, 'robots.txt'), robots());
  return facts;
}
function sitemap() {
  const pages = [
    [ORIGIN + '/', 'zh-Hant'],
    [ORIGIN + '/en/', 'en'],
    [ORIGIN + '/ja/', 'ja'],
    [ORIGIN + '/ko/', 'ko']
  ];
  const alt = pages.map(([href, lang]) => '    <xhtml:link rel="alternate" hreflang="' + lang + '" href="' + href + '"/>').join('\n')
    + '\n    <xhtml:link rel="alternate" hreflang="x-default" href="' + ORIGIN + '/en/"/>';
  const urls = pages.map(([href]) => '  <url>\n    <loc>' + href + '</loc>\n' + alt + '\n  </url>').join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + urls + '\n  <url>\n    <loc>' + ORIGIN + '/site/</loc>\n  </url>\n</urlset>\n';
}
function robots() {
  const bots = ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'Google-Extended', 'Googlebot', 'Bingbot', 'ClaudeBot', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Applebot-Extended', 'Bytespider', 'CCBot', 'cohere-ai'];
  return bots.map((bot) => 'User-agent: ' + bot + '\nAllow: /\n').join('\n') + '\nSitemap: ' + ORIGIN + '/sitemap.xml\n';
}
module.exports = {buildWelcome};
