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
  for (const loc of Object.values(expectAlt).concat(['https://future-village.github.io/site/'])) {
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
