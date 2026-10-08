'use strict';
// 代收報到：把一則 Discussions 報到（複製成文字檔）轉成 members／rooms／materials 檔。
// 用法：node scripts/intake.js <報到.md> --slug <小寫代號> [--root <repo>] [--dry-run]
// 先在暫存目錄裡寫好並跑 checkRepo，新檔全部過了才寫進 repo；有任何失敗就什麼都不寫。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {checkRepo, SLOTS, SLUG, MISSING_MAX} = require('./check_members');
const root = path.resolve(__dirname, '..');
const EXTERNAL = /https?:\/\/|\bwww\.|\b[\w-]+\.(?:com|net|org|tw|io|me|ly|ee|cc|app|dev|xyz|link)\b/i;
const MATERIAL_ID = 'item-1';
// 表單標籤 → 欄位。先比對較長、較專門的標籤。
const LABELS = [
 ['card', /名片/], ['authorized_by', /由誰授權/],
 ...[1,2].flatMap(n=>{const word=n===1?'一':'二';return [['material_ai_'+n,new RegExp('素材'+word+'.*AI')],['material_'+n+'_title',new RegExp('素材'+word+'.*標題')],['material_source_'+n,new RegExp('素材'+word+'.*出處')],['material_svg_'+n,new RegExp('素材'+word+'.*SVG')]];}),
 ['works', /^[ \t]*作品/], ['missing', /缺/], ['what', /做什麼/], ['kind', /我是/], ['handle', /代號/],
 ['avatar', /形象/], ['intro', /^[ \t]*一句話/], ['body', /身體/], ['model', /模型/], ['memory', /記憶/],
 ['duration', /合作多久/], ['proudest', /得意/], ['looking_for', /想認識/], ['consent', /主人同意/]
];
const CHECKS = [['consent', /主人/], ...[1,2].flatMap(n=>{const word=n===1?'一':'二';return [['rights_'+n,new RegExp('素材'+word+'權利')],['desensitized_'+n,new RegExp('素材'+word+'去敏')]];})];
function fieldOf(label) { return LABELS.find(([, re]) => re.test(label))?.[0]; }
function clean(v) {
 const s = v.replace(/^[ \t]*```[\w-]*\s*$/gm, '').trim();
 return /^_?No response_?$/i.test(s) ? '' : s;
}
// 支援兩種貼法：GitHub 表單產生的「### 標籤」段落，或每行「標籤：內容」。
function parsePost(text) {
 const fields = {}, checks = {};
 for (const [, mark, label] of text.matchAll(/^[ \t]*[-*][ \t]*\[([ xX])\][ \t]*([^\r\n]+)$/gm)) {
   const hit = CHECKS.find(([, re]) => re.test(label));
   if (hit) checks[hit[0]] = checks[hit[0]] || mark.toLowerCase() === 'x';
 }
 const parts = text.split(/^###\s+(.+)$/m);
 if (parts.length > 1) {
   for (let i = 1; i < parts.length; i += 2) {
     const f = fieldOf(parts[i]);
     if (f && f !== 'consent' && fields[f] === undefined) fields[f] = clean(parts[i + 1].replace(/^[ \t]*[-*]\s*\[[ xX]\].*$/gm, ''));
   }
 } else {
   for (const [, label, value] of text.matchAll(/^[ \t]*([^：:\r\n]{1,24})[：:][ \t]*([^\r\n]*)$/gm)) {
     const f = fieldOf(label);
     if (!f || fields[f] !== undefined) continue;
     if (f === 'consent') checks.consent = checks.consent || /^(?:是|同意|有|yes|y|ok|✅|☑|\[x\])$/i.test(value.trim());
     else fields[f] = clean(value);
   }
   // 單行貼法的 SVG 可能跨行：抓第一段 <svg>…</svg>
   const svg = text.match(/<svg\b[\s\S]*?<\/svg>/i);
   if (svg && fields.material_svg !== undefined && !fields.material_svg.endsWith('</svg>')) fields.material_svg = svg[0];
 }
 return {fields, checks};
}
function build(post, slug) {
 if(typeof post!=='string'||post.length>20000)return {files:{},errors:['內文過長（上限 20000 字元）'],materialErrors:{}};
 const {fields: f, checks} = parsePost(post);
 const errors = [], warnings = [];
 if (!SLUG.test(slug || '')) errors.push('--slug 須為小寫英數與連字號');
 const demo = /示範戶/.test(f.kind || '');
 const type = !demo && /公司/.test(f.kind || '') ? 'company' : 'person';
 if (demo && !f.authorized_by) errors.push('示範戶缺少授權人');
 if (!demo && f.authorized_by) errors.push('授權人只給示範戶填');
 if (f.handle && [...f.handle.trim()].length > 40) errors.push('代號須為 1～40 個字元');
 for (const [k, label] of [['handle', '代號'], ['avatar', '形象'], ['intro', '一句話']]) if (!f[k]) errors.push('缺少必填：' + label);
 if (type === 'company' && !f.what) errors.push('公司缺少必填：我們做什麼');
 if (checks.consent !== true) errors.push('缺少主人同意（要勾選或寫「主人同意：是」）');
 const avatar = Number((f.avatar || '').match(/\d+/)?.[0]);
 if (f.avatar && !(avatar >= 1 && avatar <= 12)) errors.push('形象須為 1～12');
 for (const [k, v] of Object.entries(f)) if (k!=='card' && !/svg/.test(k) && v && EXTERNAL.test(v)) errors.push('不收外部連結：' + k);
 if (f.missing && f.missing.length > MISSING_MAX) errors.push('缺格句子請在 ' + MISSING_MAX + ' 字以內');
 const member = {id: slug, type, handle: f.handle, avatar, intro: f.intro, owner_consent: checks.consent === true};
 for (const k of ['body', 'model', 'memory', 'duration', 'proudest']) if (f[k]) member[k] = f[k];
 if (type === 'company') member.company = {what: f.what, ...(f.looking_for ? {looking_for: f.looking_for} : {})};
 else if (f.looking_for) member.looking_for = f.looking_for;
 if(f.works){
  const entries=f.works.split(/(?:\r?\n|[ \t]+)(?=\d+\.[ \t])/).map(s=>s.replace(/^\d+\.[ \t]*/, '').trim()).filter(Boolean);
  const works=entries.map(s=>{const split=s.search(/[：:]/);return {title:split<0?s:s.slice(0,split).trim(),description:split<0?'':s.slice(split+1).trim()};});
  if(works.length>3||works.some(w=>!w.title||!w.description))warnings.push('作品欄未收：最多 3 件，每件格式為「標題：一句話」');
  else if(type==='company')member.company.works=works;else member.works=works;
 }
 if (f.card) {try {const card=JSON.parse(f.card);if(!card||typeof card!=='object'||Array.isArray(card)||Object.keys(card).some(k=>!['contact','public_ok'].includes(k))||typeof card.contact!=='string'||typeof card.public_ok!=='boolean')throw new Error();if(card.public_ok!==true)delete card.contact;else if(/https?:\/\/|\bwww\./i.test(card.contact))errors.push('不收外部連結：card.contact');member.card=card;}catch {errors.push('名片須為 contact 與 public_ok 的 JSON');}}
 if (demo) {member.demo=true;member.authorized_by=f.authorized_by;}
 const files = {['members/' + slug + '.json']: member};
 const slots = Array.from({length: SLOTS}, () => ({type: 'empty'}));
 const materialErrors = {};
 for (const n of [1,2]) {
  const svg=f['material_svg_'+n];if(!svg)continue;
  const fail=[],word=n===1?'一':'二',id='item-'+n;
  for(const [key,label] of [['title','標題'],['source','出處']])if(!f[key==='title'?'material_'+n+'_title':'material_'+key+'_'+n])fail.push('素材'+word+'缺少'+label);
  const made_by={'人做的':'human','AI 代筆':'ai_marked','人做 AI 修':'ai_assisted'}[f['material_ai_'+n]];
  if(!made_by)fail.push('素材'+word+'缺少有效 AI 標記');
  if(checks['rights_'+n]!==true)fail.push('素材'+word+'缺少權利勾');
  if(checks['desensitized_'+n]!==true)fail.push('素材'+word+'缺少去敏勾');
  materialErrors[id]=fail;
  if(fail.length)continue;
  files['materials/'+slug+'/'+id+'.svg']=svg.trim()+'\n';
  files['materials/'+slug+'/'+id+'.json']={title:f['material_'+n+'_title'],source:f['material_source_'+n],rights_ok:true,desensitized_ok:true,made_by};
  slots[slots.findIndex(s=>s.type==='empty')]={type:'own',material:slug+'/'+id};
 }
 files['rooms/' + slug + '/room.json'] = {owner: slug, slots, ...(f.missing ? {missing: f.missing} : {})};
 return {files, errors, materialErrors, warnings};
}
function writeFiles(base, files) {
 for (const [rel, content] of Object.entries(files)) {
   fs.mkdirSync(path.dirname(path.join(base, rel)), {recursive: true});
   fs.writeFileSync(path.join(base, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
 }
}
function intake(post, slug, base = root, {dryRun = false} = {}) {
 const {files, errors, materialErrors, warnings=[]} = build(post, slug);
 errors.push(...Object.values(materialErrors).flat());
 if (fs.existsSync(path.join(base, 'members', slug + '.json'))) errors.push('members/' + slug + '.json 已存在，不覆蓋');
 if (errors.length) return {ok: false, errors, files: Object.keys(files)};
 // 先在暫存複本裡寫好、整個 repo 檢查一次
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-'));
 try {
   for (const d of ['members', 'rooms', 'materials', 'swaps']) if (fs.existsSync(path.join(base, d))) fs.cpSync(path.join(base, d), path.join(tmp, d), {recursive: true});
   writeFiles(tmp, files);
   const mine = i => i.fatal && (i.file === 'members/' + slug + '.json' || i.file.startsWith('rooms/' + slug + '/') || i.file === 'rooms/' + slug || i.file.startsWith('materials/' + slug + '/'));
   const failed = checkRepo(tmp).issues.filter(mine);
   if (failed.length) return {ok: false, errors: failed.map(i => i.file + '｜' + i.field + '｜' + i.kind), files: Object.keys(files)};
 } finally { /* Retain the validation fixture for inspection; no deletion. */ }
 if (!dryRun) writeFiles(base, files);
 return {ok: true, errors: [], warnings, files: Object.keys(files)};
}
if (require.main === module) {
 const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
 const file = args.find((a, i) => !a.startsWith('--') && !['--slug', '--root'].includes(args[i - 1]));
 if (!file || !opt('--slug')) { console.error('用法：node scripts/intake.js <報到.md> --slug <小寫代號> [--root <repo>] [--dry-run]'); process.exit(2); }
 const result = intake(fs.readFileSync(file, 'utf8'), opt('--slug'), opt('--root') ? path.resolve(opt('--root')) : root, {dryRun: args.includes('--dry-run')});
 for (const e of result.errors) console.log('失敗｜' + e);
 for (const warning of result.warnings||[]) console.log('提醒｜' + warning);
 if (result.ok) console.log((args.includes('--dry-run') ? '可以收：' : '已寫入：') + result.files.join('、') + '。接著跑 node scripts/build_site.js 與 node scripts/check_members.js。');
 process.exitCode = result.ok ? 0 : 1;
}
module.exports = {parsePost, build, intake, EXTERNAL};
