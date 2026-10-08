const {mkTmp,safeRm}=require('./_tmp');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {checkRepo,materialSvgIssues,SLOTS}=require('../scripts/check_members');
const root=path.join(__dirname,'..'),cli=path.join(root,'scripts/check_members.js');
const run=dir=>cp.spawnSync(process.execPath,[cli,dir]).status;
const fatal=r=>r.issues.filter(i=>i.fatal);
// 把 repo 的成員、房間、素材、互換複製到暫存目錄，改一處再檢查。
function copy(){
 const dir=require('./_fixture').fixture('weroom-');
 return dir;
}
const edit=(dir,file,fn)=>{const p=path.join(dir,file);const j=JSON.parse(fs.readFileSync(p,'utf8'));fn(j);fs.writeFileSync(p,JSON.stringify(j))};
const swapFile='swaps/example-company__example-person.json';
test('範例 repo 通過；CLI exit 0；N 為 0',()=>{
 const r=checkRepo(copy());
 assert.deepEqual(fatal(r),[]);
 assert.equal(r.n,0);
 assert.equal(run(copy()),0);
});
test('每間房固定 6 格；範例互換已完成且兩邊都掛上對方素材',()=>{
 const r=checkRepo(copy());
 for(const room of r.rooms.values())assert.equal(room.slots.length,SLOTS);
 const s=r.swaps.get('example-company__example-person');
 assert.ok(s.a_ok&&s.b_ok);
 assert.ok(r.rooms.get('example-person').slots.some(x=>x.type==='swap'&&x.material===s.a_material));
 assert.ok(r.rooms.get('example-company').slots.some(x=>x.type==='swap'&&x.material===s.b_material));
});
test('展示櫃不進 N；本人同意的新成員才進',()=>{
 const dir=copy();
 const draft=checkRepo(dir).members.get('aiwff-main-brain');
 if(draft)assert.equal(draft.showcase,true);
 edit(dir,'members/example-person.json',m=>{delete m.example});
 assert.equal(checkRepo(dir).n,1);
 edit(dir,'members/example-person.json',m=>{m.showcase=true});
 assert.equal(checkRepo(dir).n,0);
});
test('故意壞的範例：CLI exit 非 0',()=>{
 assert.equal(run(path.join(__dirname,'fixtures/bad-room')),1);
 const kinds=fatal(checkRepo(path.join(__dirname,'fixtures/bad-room'))).map(i=>i.kind).join('\n');
 for(const k of ['LINE 連結','<script>','價格','只有一邊同意','固定 6 格'])assert.ok(kinds.includes(k),k);
});
test('單邊同意：互換失敗，掛上的格子也失敗',()=>{
 const dir=copy();
 edit(dir,swapFile,s=>{s.b_ok=false});
 const kinds=fatal(checkRepo(dir)).map(i=>i.file+' '+i.kind);
 assert.ok(kinds.some(k=>k.includes('只有一邊同意')));
 assert.ok(kinds.some(k=>k.startsWith('rooms/')&&k.includes('還沒完成')));
 assert.equal(run(dir),1);
});
test('價格、稀有度、幣別欄一律擋',()=>{
 for(const key of ['price','rarity','currency','價格']){
   const dir=copy();
   edit(dir,swapFile,s=>{s[key]=1});
   assert.ok(fatal(checkRepo(dir)).some(i=>i.kind.includes('價格')),key);
   assert.equal(run(dir),1);
 }
});
test('LINE 連結一律擋，名片同意也不豁免',()=>{
 const dir=copy();
 edit(dir,'members/example-person.json',m=>{m.card={public_ok:true,contact:'https://lin.ee/FAKE_TEST'}});
 assert.ok(fatal(checkRepo(dir)).some(i=>i.kind==='LINE 連結'));
 assert.equal(run(dir),1);
});
test('素材 SVG 白名單',()=>{
 for(const svg of ['<svg><script>x</script></svg>','<svg><foreignObject/></svg>','<svg><rect onclick="x"/></svg>','<svg><use href="#a"/></svg>','<svg><image href="https://example.invalid/a.png"/></svg>','<svg><a href="//example.invalid">x</a></svg>','<!DOCTYPE svg><svg></svg>','<svg><iframe/></svg>'])
   assert.ok(materialSvgIssues(svg).length,svg);
 assert.deepEqual(materialSvgIssues('<svg xmlns="http://www.w3.org/2000/svg"><title>t</title><g><path d="M0 0"/><text>字</text></g></svg>'),[]);
});
test('素材缺出處、權利勾、去敏勾都擋；格子掛別人的素材要經過互換',()=>{
 for(const [k,v] of [['source',''],['rights_ok',false],['desensitized_ok',undefined]]){
   const dir=copy();
   edit(dir,'materials/example-person/plant-notes.json',m=>{m[k]=v});
   assert.equal(run(dir),1,k);
 }
 const dir=copy();
 edit(dir,'rooms/example-person/room.json',r=>{r.slots[3]={type:'own',material:'example-company/season-card'}});
 assert.equal(run(dir),1);
});
test('每個成員都要有房間，房間不能多於或少於 6 格',()=>{
 let dir=copy();
 safeRm(dir,'rooms/example-company');
 assert.equal(run(dir),1);
 dir=copy();
 edit(dir,'rooms/example-company/room.json',r=>{r.slots.pop()});
 assert.equal(run(dir),1);
});
test('缺格句子：選填、60 字以內；room.json 不收其他欄',()=>{
 assert.ok(checkRepo(copy()).rooms.get('example-person').missing);
 let dir=copy();
 edit(dir,'rooms/example-person/room.json',r=>{r.missing='缺'.repeat(61)});
 assert.equal(run(dir),1);
 dir=copy();
 edit(dir,'rooms/example-person/room.json',r=>{r.missing='加我 https://lin.ee/FAKE'});
 assert.equal(run(dir),1);
 dir=copy();
 edit(dir,'rooms/example-person/room.json',r=>{r.note='x'});
 assert.equal(run(dir),1);
 dir=copy();
 edit(dir,'rooms/example-person/room.json',r=>{delete r.missing});
 assert.equal(run(dir),0);
});
