const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {checkRepo} = require('../scripts/check_members');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const pack = (name) => JSON.parse(read(path.join('i18n', name)));

test('歡迎頁四語把信和互換指到表單與 check-in，不宣稱代收', () => {
  const expect = {
    'zh-Hant.json': '還沒接代收',
    'en.json': 'is not auto-collected',
    'ja.json': '自動では受け付けていません',
    'ko.json': '아직 자동으로 받지 않아요'
  };
  for (const [file, marker] of Object.entries(expect)) {
    const data = pack(file);
    const letter = data.faq.find((item) => /信怎麼寄|How do letters|手紙はどう|편지는 어떻게/.test(item.q));
    const swap = data.faq.find((item) => /素材怎麼換|How do swaps|素材の交換|소재는 어떻게/.test(item.q));
    assert.ok(letter && swap, file);
    const text = letter.a + '\n' + swap.a;
    assert.ok(text.includes(marker), file);
    assert.ok(text.includes('DISCUSSION_TEMPLATE/letters.yml'), file);
    assert.ok(text.includes('DISCUSSION_TEMPLATE/swaps.yml'), file);
    assert.match(letter.a, /check-in/);
    assert.match(swap.a, /check-in/);
    assert.equal(/categories\/letters|categories\/swaps/.test(text), false, file);
    assert.equal(typeof data.c2_cta, 'string');
    assert.ok(data.c2_cta && data.c3_cta);
  }
});

test('歡迎頁與房間頁的連結指到表單檔和 check-in', () => {
  const page = read('welcome/page.html');
  const build = read('scripts/build_welcome.js');
  const app = read('site/app.js');
  assert.match(page, /href="\{\{swap_href\}\}"/);
  assert.match(page, /href="\{\{letter_href\}\}"/);
  assert.match(build, /DISCUSSION_TEMPLATE\/letters\.yml/);
  assert.match(build, /DISCUSSION_TEMPLATE\/swaps\.yml/);
  assert.match(build, /letter_href: LETTER_FORM/);
  assert.match(build, /swap_href: SWAP_FORM/);
  assert.match(app, /DISCUSSION_TEMPLATE\/letters\.yml/);
  assert.match(app, /DISCUSSION_TEMPLATE\/swaps\.yml/);
  assert.match(app, /discussions\/categories\/check-in/);
  assert.equal(/categories\/letters|categories\/swaps/.test(app), false);
});

test('代收仍只收 check-in', () => {
  const intake = read('.github/workflows/intake.yml');
  assert.match(intake, /category\.slug == 'check-in'/);
  assert.equal(/letters|swaps/.test(intake), false);
  assert.match(read('scripts/intake_sweep.js'), /slug!=='check-in'/);
  assert.match(read('scripts/intake_from_event.js'), /slug!=='check-in'/);
});

test('表單有主人同意，且沒有把兩邊 ok 一次勾完的欄', () => {
  const letters = read('.github/DISCUSSION_TEMPLATE/letters.yml');
  const swaps = read('.github/DISCUSSION_TEMPLATE/swaps.yml');
  for (const id of ['from', 'to', 'date', 'body', 'ai-written', 'consent']) assert.match(letters, new RegExp('id: ' + id));
  for (const id of ['my-slug', 'their-slug', 'my-material', 'their-material', 'drafted-by', 'consent']) assert.match(swaps, new RegExp('id: ' + id));
  assert.match(letters, /ai_written 為 false/);
  assert.match(swaps, /a_ok 與 b_ok 都寫 false/);
  assert.equal(/forward/.test(letters), false);
});

test('正例：範例信與兩邊同意的互換沒有失敗', () => {
  const dir = require('./_fixture').fixture('entry-ok-');
  const fatal = checkRepo(dir, {today: '2026-10-08'}).issues.filter((i) => i.fatal);
  assert.deepEqual(fatal, []);
});

test('反例：同一人同一天第二封信失敗', () => {
  const dir = require('./_fixture').fixture('entry-letter-');
  const rel = 'letters/pending/example-person__aiwff-main-brain__2026-10-08.json';
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), JSON.stringify({
    from: 'example-person', to: 'aiwff-main-brain', date: '2026-10-08', body: '第二封', ai_written: false
  }));
  assert.ok(checkRepo(dir, {today: '2026-10-08'}).issues.some((i) => i.fatal && i.kind.includes('只能寄一封')));
});

test('反例：單邊同意不能當成完成互換', () => {
  const dir = require('./_fixture').fixture('entry-swap-');
  const file = path.join(dir, 'swaps/example-company__example-person.json');
  const swap = JSON.parse(fs.readFileSync(file, 'utf8'));
  swap.b_ok = false;
  fs.writeFileSync(file, JSON.stringify(swap));
  const kinds = checkRepo(dir, {today: '2026-10-08'}).issues.filter((i) => i.fatal).map((i) => i.kind);
  assert.ok(kinds.some((k) => k.includes('只有一邊同意')));
  assert.ok(kinds.some((k) => k.includes('還沒完成')));
});
