'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture} = require('./_fixture');
const {checkRepo, nextTaipeiDay, checkBook} = require('../scripts/check_members');
const {householdMachine} = require('../scripts/build_world');
const {build} = require('../scripts/intake');
const TODAY = '2026-10-08';
const root = path.join(__dirname, '..');
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const write = (dir, rel, obj) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), JSON.stringify(obj, null, 2) + '\n');
};
function proposal(a, b, aMaterial, bMaterial, proposed_on) {
  return {a, b, a_material: aMaterial, b_material: bMaterial, a_ok: false, b_ok: false, drafted_by: 'ai', proposed_on};
}
const firstRel = 'swaps/aiwff-main-brain__example-company.json';
const secondRel = 'swaps/aiwff-main-brain__example-person.json';
function seedProposals(dir, day) {
  write(dir, firstRel, proposal('aiwff-main-brain', 'example-company', 'aiwff-main-brain/ai-checkup', 'example-company/season-card', day));
  write(dir, secondRel, proposal('aiwff-main-brain', 'example-person', 'aiwff-main-brain/soplint', 'example-person/plant-notes', day));
}
const quota = (issues, rel) => issues.filter(i => i.file === rel && i.kind.includes('只能新提一筆'));

test('一戶一天一筆提案沒有額度失敗；檔案原樣', () => {
  const dir = fixture();
  write(dir, secondRel, proposal('aiwff-main-brain', 'example-person', 'aiwff-main-brain/soplint', 'example-person/plant-notes', TODAY));
  const before = read(dir, secondRel);
  const issues = checkRepo(dir, {today: TODAY}).issues;
  assert.equal(quota(issues, secondRel).length, 0);
  assert.ok(issues.some(i => i.file === secondRel && i.field === 'a_ok/b_ok' && i.fatal));
  assert.equal(read(dir, secondRel), before);
});

test('同一戶同一天第二筆提案失敗，兩份 proposed_on 都不改', () => {
  const dir = fixture();
  seedProposals(dir, TODAY);
  const beforeFirst = read(dir, firstRel), beforeSecond = read(dir, secondRel);
  const issues = checkRepo(dir, {today: TODAY}).issues;
  assert.equal(quota(issues, firstRel).length, 0);
  assert.equal(quota(issues, secondRel).length, 1);
  assert.match(quota(issues, secondRel)[0].advice, /2026-10-09/);
  assert.equal(read(dir, firstRel), beforeFirst);
  assert.equal(read(dir, secondRel), beforeSecond);
  assert.equal(JSON.parse(beforeSecond).proposed_on, TODAY);
});

test('提案缺 proposed_on、或日期晚於今天，都失敗且不改檔', () => {
  const dir = fixture();
  const open = proposal('aiwff-main-brain', 'example-person', 'aiwff-main-brain/soplint', 'example-person/plant-notes', TODAY);
  delete open.proposed_on;
  write(dir, secondRel, open);
  assert.ok(checkRepo(dir, {today: TODAY}).issues.some(i => i.file === secondRel && i.kind.includes('提案要標台灣日曆日')));
  const future = nextTaipeiDay(TODAY);
  write(dir, secondRel, proposal('aiwff-main-brain', 'example-person', 'aiwff-main-brain/soplint', 'example-person/plant-notes', future));
  const before = read(dir, secondRel);
  const issues = checkRepo(dir, {today: TODAY}).issues;
  assert.ok(issues.some(i => i.file === secondRel && i.kind.includes('提案日不能晚於今天')));
  assert.equal(read(dir, secondRel), before);
});

test('兩邊都同意且沒有 proposed_on 的舊互換仍通過額度', () => {
  const dir = fixture();
  const issues = checkRepo(dir, {today: TODAY}).issues.filter(i => i.fatal && i.file.startsWith('swaps/'));
  assert.deepEqual(issues, []);
});

test('同一人同一天第二封信失敗並指向下一個台灣日；未來寄出日仍失敗', () => {
  const dir = fixture();
  const rel = 'letters/pending/example-person__aiwff-main-brain__' + TODAY + '.json';
  const letter = {from: 'example-person', to: 'aiwff-main-brain', date: TODAY, body: '虛構測試信第二封', ai_written: false};
  write(dir, rel, letter);
  const before = read(dir, rel);
  const existingRel = 'letters/pending/example-person__example-company__' + TODAY + '.json';
  const hits = checkRepo(dir, {today: TODAY}).issues.filter(i => [rel, existingRel].includes(i.file) && i.kind.includes('只能寄一封'));
  assert.equal(hits.length, 1);
  const hit = hits[0];
  assert.ok(hit);
  assert.match(hit.advice, /2026-10-09/);
  assert.match(hit.advice, /不改日期/);
  assert.equal(read(dir, rel), before);
  const futureRel = 'letters/pending/example-company__aiwff-main-brain__' + nextTaipeiDay(TODAY) + '.json';
  write(dir, futureRel, {from: 'example-company', to: 'aiwff-main-brain', date: nextTaipeiDay(TODAY), body: '虛構未來信', ai_written: false});
  assert.ok(checkRepo(dir, {today: TODAY}).issues.some(i => i.file === futureRel && i.kind.includes('不能晚於今天')));
});

test('我有只收自己過檢查的 ref；權利勾關掉就從 offers 消失', () => {
  const dir = fixture();
  const repo = checkRepo(dir, {today: TODAY});
  const member = repo.members.get('example-person');
  const room = repo.rooms.get('example-person');
  const fields = householdMachine(member, room, repo.catalog);
  assert.deepEqual(fields.offers, ['example-person/morning-sketch', 'example-person/plant-notes']);
  assert.equal(fields.missing, '想掛一件別人畫的地圖或路線圖');
  assert.equal(fields.owner_seen, true);
  assert.equal(householdMachine({...member, owner_consent: false}, room, repo.catalog).owner_seen, false);
  const metaPath = path.join(dir, 'materials/example-person/plant-notes.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.rights_ok = false;
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  const again = checkRepo(dir, {today: TODAY});
  assert.equal(again.catalog.some(c => c.ref === 'example-person/plant-notes'), false);
  assert.deepEqual(householdMachine(member, room, again.catalog).offers, ['example-person/morning-sketch']);
});

test('代收報到不寫信、不寫互換、不寫 offers 或 owner_seen', () => {
  const post = fs.readFileSync(path.join(root, 'tests/fixtures/intake/good-simple.md'), 'utf8');
  const {files} = build(post, 'wood-shop');
  assert.equal(Object.keys(files).some(rel => rel.startsWith('letters/') || rel.startsWith('swaps/')), false);
  const member = files['members/wood-shop.json'];
  const roomFile = files['rooms/wood-shop/room.json'];
  assert.equal('offers' in member, false);
  assert.equal('owner_seen' in member, false);
  assert.equal('offers' in roomFile, false);
  assert.equal(roomFile.missing, '想掛一件別人的配色表');
  assert.equal(member.owner_consent, true);
});

test('街上、立體村與配對腳本不渲染三欄，也不寫請你去換', () => {
  for (const rel of ['site/app.js', 'site/world/village.js', 'scripts/build_patrol.js']) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(src.includes('offers'), false, rel);
    assert.equal(src.includes('owner_seen'), false, rel);
    assert.equal(src.includes('請你去換'), false, rel);
  }
  assert.equal(fs.readFileSync(path.join(root, 'site/app.js'), 'utf8').includes('這間房還缺'), true);
});

test('書架舊正例仍不要求 version 或 verified_on', () => {
  const good = {title: 'Book', summary: 'Description', source_url: 'https://example.org/book', tags: ['tools'], added_by: 'example-person', made_by: 'human', license: 'CC BY 4.0', do_not_execute: true};
  assert.deepEqual(checkBook(good), []);
});
