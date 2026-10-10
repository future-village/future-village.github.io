const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mkTmp}=require('./_tmp'),{checkBook,checkRepo}=require('../scripts/check_members');
const root=path.resolve(__dirname,'..');
const TODAY='2026-10-10';
const fence='`'.repeat(3);
function goodBook(over={}){return {title:'Book',summary:'Description',source_url:'https://example.org/book',tags:['tools'],added_by:'example-person',made_by:'human',license:'CC BY 4.0',do_not_execute:true,version:'1',verified_on:'2026-10-08',...over};}
function copyRepo(){const dir=mkTmp('cobuild-');fs.cpSync(root,dir,{recursive:true,filter:src=>!src.includes(path.sep+'.git')&&!src.includes(path.sep+'_site')});return dir;}
function fatals(dir,today=TODAY){return checkRepo(dir,{today}).issues.filter(i=>i.fatal);}
test('book accepts version and a verification date on or before today',()=>{
 assert.deepEqual(checkBook(goodBook(),'book',TODAY),[]);
 assert.deepEqual(checkBook(goodBook({verified_on:TODAY}),'book',TODAY),[]);
 assert.deepEqual(checkBook(goodBook({summary:'Do not import or require this text.'}),'book',TODAY),[]);
});
test('book rejects missing fields, bad dates, and executable marks',()=>{
 for(const key of ['version','verified_on']){const bad=goodBook();delete bad[key];assert.ok(checkBook(bad,'book',TODAY).some(i=>i.field===key),key);}
 assert.ok(checkBook(goodBook({verified_on:'2099-01-01'}),'book',TODAY).some(i=>i.field==='verified_on'&&i.kind.includes('不能晚於今天')));
 assert.ok(checkBook(goodBook({verified_on:'2026-02-30'}),'book',TODAY).some(i=>i.field==='verified_on'));
 assert.ok(checkBook(goodBook({do_not_execute:'true'}),'book',TODAY).some(i=>i.field==='do_not_execute'));
 assert.ok(checkBook(goodBook({made_by:'ai_assisted'}),'book',TODAY).some(i=>i.field==='made_by'));
 for(const summary of [fence+'js\nrun()\n'+fence,'~~~','see <script>','javascript:alert(1)','data:text/html,hi','<img onload=1>'])assert.ok(checkBook(goodBook({summary}),'book',TODAY).some(i=>i.kind==='不收可執行內容'),summary);
});
test('library accepts one json book and rejects other entries',()=>{
 const dir=copyRepo();
 fs.writeFileSync(path.join(dir,'library','guide.json'),JSON.stringify(goodBook()));
 assert.equal(fatals(dir).some(i=>i.file.startsWith('library/')),false);
 fs.writeFileSync(path.join(dir,'library','SKILL.md'),'# no\n');
 assert.ok(fatals(dir).some(i=>i.file==='library/SKILL.md'&&i.kind==='書架只收純文字 JSON'));
 fs.mkdirSync(path.join(dir,'library','notes'));
 fs.writeFileSync(path.join(dir,'library','notes','book.json'),JSON.stringify(goodBook()));
 assert.ok(fatals(dir).some(i=>i.file==='library/notes'&&i.kind==='書架只收純文字 JSON'));
 assert.ok(fatals(dir).some(i=>i.file==='library/notes/book.json'&&i.kind==='書架只收純文字 JSON'));
 fs.writeFileSync(path.join(dir,'library','run.js'),'console.log(1)\n');
 assert.ok(fatals(dir).some(i=>i.file==='library/run.js'&&i.kind==='書架只收純文字 JSON'));
});
test('current fence_run credit passes and the other three glb files are absent',()=>{
 const dir=copyRepo();
 assert.deepEqual(fatals(dir).filter(i=>i.file==='site/world/assets/models'||i.file==='ART_CREDITS.md'),[]);
 for(const name of ['tree_round.glb','tree_pine.glb','lamp.glb'])assert.equal(fs.existsSync(path.join(root,'site/world/assets/models',name)),false,name);
 const src=fs.readFileSync(path.join(root,'site/world/village.js'),'utf8');
 assert.match(src,/const PROP_GLB=\[\s*\['fence','fence_run'/);
});
test('a new glb fails closed until one CC0 line names it',()=>{
 const dir=copyRepo();
 const raw=fs.readFileSync(path.join(dir,'site/world/assets/models/fence_run.glb'));
 const model=path.join(dir,'site/world/assets/models/bench_new.glb');
 fs.writeFileSync(model,raw);
 assert.ok(fatals(dir).some(i=>i.field==='bench_new.glb'&&i.kind==='ART_CREDITS.md 缺這個檔名'));
 fs.appendFileSync(path.join(dir,'ART_CREDITS.md'),'\n- bench_new.glb — MIT. Source: https://example.org/bench . License file: LICENSE-kenney-fantasy-town-kit.txt\n');
 assert.ok(fatals(dir).some(i=>i.field==='bench_new.glb'&&i.kind==='同一行要有 CC0'));
});
test('CC0 plus another license on the same line fails',()=>{
 const dir=copyRepo();
 fs.writeFileSync(path.join(dir,'site/world/assets/models/bench_new.glb'),fs.readFileSync(path.join(dir,'site/world/assets/models/fence_run.glb')));
 fs.appendFileSync(path.join(dir,'ART_CREDITS.md'),'\n- bench_new.glb — CC0 and CC BY 4.0. Source: https://example.org/bench . License file: LICENSE-kenney-fantasy-town-kit.txt\n');
 assert.ok(fatals(dir).some(i=>i.field==='bench_new.glb'&&i.kind==='同一行出現非 CC0 授權'));
});
test('a license file that is not CC0 fails',()=>{
 const dir=copyRepo();
 fs.writeFileSync(path.join(dir,'site/world/assets/models/bench_new.glb'),fs.readFileSync(path.join(dir,'site/world/assets/models/fence_run.glb')));
 fs.writeFileSync(path.join(dir,'site/world/assets/models/LICENSE-bench.txt'),'License: MIT\n');
 fs.appendFileSync(path.join(dir,'ART_CREDITS.md'),'\n- bench_new.glb — CC0. Source: https://example.org/bench . License file: LICENSE-bench.txt\n');
 assert.ok(fatals(dir).some(i=>i.field==='bench_new.glb'&&i.kind==='授權檔不是 CC0'));
});
test('one CC0 line and a CC0 license file accepts the new glb',()=>{
 const dir=copyRepo();
 fs.writeFileSync(path.join(dir,'site/world/assets/models/bench_new.glb'),fs.readFileSync(path.join(dir,'site/world/assets/models/fence_run.glb')));
 fs.appendFileSync(path.join(dir,'ART_CREDITS.md'),'\n- bench_new.glb — CC0. Source: https://example.org/bench . License file: LICENSE-kenney-fantasy-town-kit.txt\n');
 assert.equal(fatals(dir).some(i=>i.field==='bench_new.glb'),false);
});
test('CODEOWNERS locks the four layer-3 trees',()=>{
 const text=fs.readFileSync(path.join(root,'.github/CODEOWNERS'),'utf8');
 for(const rule of ['/.github/','/scripts/','/site/world/','/tests/'])assert.match(text,new RegExp('^'+rule.replace(/[/.]/g,'\\$&')+'\\s+@zaxardery8011-design\\s*$','m'),rule);
 assert.match(text,/site\/world\/village\.js/);
 assert.equal(fs.existsSync(path.join(root,'site/world/village.js')),true);
 const rules=text.split(/\r?\n/).map(line=>line.replace(/#.*$/,'').trim()).filter(Boolean);
 assert.equal(rules.some(line=>line.startsWith('*')),false);
 const doc=fs.readFileSync(path.join(root,'CONTRIBUTING.md'),'utf8');
 assert.match(doc,/第二層：公共建設/);
 assert.match(doc,/第三層：程式/);
 assert.match(doc,/verified_on/);
 assert.match(doc,/Require review from Code Owners/);
});
