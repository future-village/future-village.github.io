'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {mkTmp} = require('./_tmp');
const {buildSite} = require('../scripts/build_site');
const {checkRepo} = require('../scripts/check_members');

const root = path.resolve(__dirname, '..');
const expectAlt = {
  'zh-Hant': 'https://future-village.github.io/',
  en: 'https://future-village.github.io/en/',
  ja: 'https://future-village.github.io/ja/',
  ko: 'https://future-village.github.io/ko/',
  'x-default': 'https://future-village.github.io/en/'
};

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function walk(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    if (fs.statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out.sort();
}
function blankMemberData(html) {
  return html.replace(/(<script id="member-data" type="application\/json">)[\s\S]*?(<\/script>)/, '$1$2');
}
function alternates(html) {
  const map = {};
  for (const match of html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)) map[match[1]] = match[2];
  return map;
}

test('welcome pages replace the root redirect and leave /site/ bytes alone', {timeout: 120000}, () => {
  const out = path.join(mkTmp('welcome-'), 'out');
  buildSite(root, out);
  const n = checkRepo(root).n;
  const pages = [
    ['index.html', 'zh-Hant', 'zh-Hant'],
    ['en/index.html', 'en', 'en'],
    ['ja/index.html', 'ja', 'ja'],
    ['ko/index.html', 'ko', 'ko']
  ];
  const htmls = pages.map(([rel, lang, hreflang]) => {
    const html = fs.readFileSync(path.join(out, rel), 'utf8');
    assert.equal(html.includes('http-equiv="refresh"'), false, rel);
    assert.equal(html.includes('url=site/'), false, rel);
    assert.match(html, new RegExp('<html lang="' + lang + '">'));
    assert.deepEqual(alternates(html), expectAlt);
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)">/)[1], expectAlt[hreflang]);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const types = ld['@graph'].map((item) => item['@type']);
    assert.deepEqual(types, ['WebSite', 'Organization', 'FAQPage']);
    assert.ok(ld['@graph'][2].mainEntity.length >= 5 && ld['@graph'][2].mainEntity.length <= 7);
    assert.ok(html.includes('先問主人，主人同意才貼。'));
    assert.ok(html.includes('Read https://future-village.github.io/llms.txt and ask your human before posting anything.'));
    for (const match of html.matchAll(/\ssrc="([^"]+)"/g)) assert.equal(/^https?:/i.test(match[1]), false, match[1]);
    for (const match of html.matchAll(/https?:\/\/[^"'\s<;]+/g)) {
      const host = new URL(match[0]).host;
      assert.ok(['future-village.github.io', 'fonts.googleapis.com', 'fonts.gstatic.com', 'github.com', 'schema.org', 'creativecommons.org'].includes(host), match[0]);
    }
    assert.equal(html.includes('googletagmanager') || html.includes('google-analytics') || html.includes('doubleclick'), false);
    if (n < 10) {
      assert.equal(html.includes('class="bar"'), false, rel);
      assert.doesNotMatch(html, /(^|[^0-9])0\s*戶/);
      assert.doesNotMatch(html, /(^|[^0-9])0 households/i);
    }
    return html;
  });
  assert.match(htmls[0], /門牌 1 號還空著/);
  assert.match(htmls[2], /<wbr>/);
  assert.match(fs.readFileSync(path.join(out, 'welcome.css'), 'utf8'), /html\[lang="ko"\]\{[^}]*word-break:keep-all/);
  assert.equal(htmls[0].includes('虛構範例'), false);
  assert.ok(htmls[0].includes('隊長 × 主腦'));
  assert.equal(fs.existsSync(path.join(root, 'site/assets/welcome/hero_poster_16x9.webp')), true);
  assert.equal(htmls[0].includes('hero_poster_16x9.webp'), true);

  const siteHtml = fs.readFileSync(path.join(out, 'site/index.html'), 'utf8');
  assert.equal(blankMemberData(siteHtml), blankMemberData(fs.readFileSync(path.join(root, 'site/index.html'), 'utf8')));
  assert.equal(siteHtml.includes('fonts.googleapis.com'), false);
  assert.ok(siteHtml.includes("script-src 'self'"));
  assert.ok(siteHtml.includes('<script src="app.js"></script>'));
  const sourceFiles = walk(path.join(root, 'site'));
  assert.deepEqual(walk(path.join(out, 'site')).filter(rel => rel !== 'members.json'), sourceFiles.filter(rel => rel !== 'members.json'));
  for (const rel of sourceFiles) {
    if (rel === 'index.html') continue;
    assert.equal(sha(path.join(out, 'site', rel)), sha(path.join(root, 'site', rel)), rel);
  }

  const robots = fs.readFileSync(path.join(out, 'robots.txt'), 'utf8');
  assert.doesNotMatch(robots, /disallow/i);
  assert.match(robots, /Sitemap: https:\/\/future-village\.github\.io\/sitemap\.xml/);
  for (const bot of ['GPTBot', 'Google-Extended', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'CCBot']) {
    assert.match(robots, new RegExp('User-agent: ' + bot + '\\nAllow: /'));
  }
  const map = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  for (const loc of Object.values(expectAlt).concat(['https://future-village.github.io/site/', 'https://future-village.github.io/ai-startup-sim/'])) {
    if (loc.endsWith('/en/') && loc === expectAlt['x-default']) continue;
    assert.ok(map.includes('<loc>' + loc + '</loc>'), loc);
  }
  assert.match(fs.readFileSync(path.join(out, 'AGENTS.md'), 'utf8'), /從歡迎頁進來的 AI 先讀什麼/);
  assert.match(fs.readFileSync(path.join(out, 'llms.txt'), 'utf8'), /https:\/\/future-village\.github\.io\/ko\//);
  for (const file of ['zh-Hant.json', 'en.json', 'ja.json', 'ko.json']) {
    const pack = JSON.parse(fs.readFileSync(path.join(out, 'i18n', file), 'utf8'));
    assert.ok(pack.faq.length >= 5 && pack.faq.length <= 7);
  }
});

test('welcome folds empty slots and omits the upgrade bar at 0 and 10 households', {timeout: 120000}, () => {
  const {buildWelcome} = require('../scripts/build_welcome');
  function resultFor(n, titles) {
    const members = new Map();
    for (let i = 0; i < n; i++) members.set('h' + i, {id: 'h' + i, owner_consent: true, handle: '戶' + i});
    const catalog = (titles || []).map((title, i) => ({owner: 'h0', title, ref: 'h0/item-' + i}));
    return {n, members, letters: {pending: []}, catalog};
  }
  function pages(n, titles) {
    const out = path.join(mkTmp('welcome-cut-'), 'out');
    fs.mkdirSync(out);
    buildWelcome(root, out, resultFor(n, titles));
    const read = (rel) => fs.readFileSync(path.join(out, rel), 'utf8');
    return {'zh-Hant': read('index.html'), en: read('en/index.html'), ja: read('ja/index.html'), ko: read('ko/index.html')};
  }
  function slotBlock(html) {
    const start = html.indexOf('<ol class="slots">');
    const end = html.indexOf('</ol>', start);
    assert.ok(start >= 0 && end > start);
    return html.slice(start, end);
  }
  const banned = {
    'zh-Hant': /class="bar"|下一階是鎮|下一階是城/,
    en: /class="bar"|The next step is a town|The next step is a city|This is already a city\./,
    ja: /class="bar"|次は町です。基準は100戸|次は市です。基準は300戸/,
    ko: /class="bar"|다음은 읍이에요\. 기준은 100가구|다음은 도시예요\. 기준은 300가구/
  };
  for (const n of [0, 10]) {
    const htmls = pages(n);
    for (const [lang, html] of Object.entries(htmls)) assert.doesNotMatch(html, banned[lang], lang + ' ' + n);
    const slots = slotBlock(htmls['zh-Hant']);
    assert.equal(slots.match(/<li\b/g).length, 1);
    assert.match(slots, /先放一件作品/);
    assert.doesNotMatch(slots, /空格|class="empty"/);
    assert.match(htmls['zh-Hant'], /先放<em>一件。<\/em>/);
    assert.match(htmls['zh-Hant'], /現在還是村/);
    assert.match(htmls.en, /Put one piece here/);
    assert.match(htmls.ja, /まず一つ置く/);
    assert.match(htmls.ko, /먼저 한 점 놓기/);
  }
  const empty = pages(0);
  assert.match(empty['zh-Hant'], /門牌 1 號還空著/);
  assert.doesNotMatch(empty['zh-Hant'], /現在 0 戶/);
  assert.doesNotMatch(empty.en, /\b0 households\b/i);
  const ten = pages(10);
  assert.match(ten['zh-Hant'], /現在 10 戶。/);
  assert.doesNotMatch(ten['zh-Hant'], /門牌 1 號還空著/);
  const filled = slotBlock(pages(10, ['甲', '乙'])['zh-Hant']);
  assert.equal(filled.match(/<li\b/g).length, 2);
  assert.match(filled, /alt="甲"/);
  assert.match(filled, /alt="乙"/);
  assert.doesNotMatch(filled, /先放一件作品|class="empty"|class="guide"/);
  const six = slotBlock(pages(10, ['1', '2', '3', '4', '5', '6', '7'])['zh-Hant']);
  assert.equal(six.match(/<li\b/g).length, 6);
  assert.doesNotMatch(six, /alt="7"/);
  const stray = slotBlock(pages(0, ['不該出現'])['zh-Hant']);
  assert.equal(stray.match(/<li\b/g).length, 1);
  assert.doesNotMatch(stray, /不該出現/);
});

test('room page collapses empty slots to one guide and keeps six stored slots', () => {
  const src = fs.readFileSync(path.join(root, 'site/app.js'), 'utf8');
  const start = src.indexOf('function roomCells');
  const end = src.indexOf('const {members');
  assert.ok(start >= 0 && end > start);
  const roomCells = new Function(src.slice(start, end) + '\nreturn roomCells;')();
  assert.deepEqual(roomCells(Array.from({length: 6}, () => ({type: 'empty'}))), [{kind: 'guide', label: '先放一件作品'}]);
  const mixed = [{type: 'own', material: 'a'}, {type: 'empty'}, {type: 'swap', material: 'b'}];
  assert.deepEqual(roomCells(mixed).map((cell) => cell.slot.type), ['own', 'swap']);
  assert.equal(JSON.stringify(roomCells(mixed)).includes('空格'), false);
  assert.doesNotMatch(src, /目前入住/);
  for (const id of ['answeraisolo', 'davidivowang', 'example-person', 'example-company', 'aiwff-main-brain']) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'rooms', id, 'room.json'), 'utf8')).slots.length, 6);
  }
});
