const {mkTmp,safeRm}=require('./_tmp');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {checkRepo,taipeiToday}=require('../scripts/check_members');
const {deliver}=require('../scripts/deliver_letters');
const root=path.join(__dirname,'..'),cli=path.join(root,'scripts/check_members.js');
const TODAY='2026-10-08';
const fatal=(dir,today=TODAY)=>checkRepo(dir,{today}).issues.filter(i=>i.fatal);
const run=(dir,today=TODAY)=>cp.spawnSync(process.execPath,[cli,dir,'--today',today]).status;
function copy(){
 const dir=require('./_fixture').fixture('letters-');

 return dir;
}
const write=(dir,rel,obj)=>{fs.mkdirSync(path.dirname(path.join(dir,rel)),{recursive:true});fs.writeFileSync(path.join(dir,rel),typeof obj==='string'?obj:JSON.stringify(obj))};
const letter=(from,to,date,extra={})=>({from,to,date,body:'虛構測試信',ai_written:false,...extra});
const P='example-person',C='example-company';
test('範例：一封已送、一封待送、兩行足跡，目錄和素材對得上',()=>{
 const r=checkRepo(copy(),{today:TODAY});
 assert.deepEqual(r.issues.filter(i=>i.fatal),[]);
 assert.equal(r.letters.delivered.length,1);assert.equal(r.letters.pending.length,1);
 assert.equal(r.footprints.length,2);
 assert.equal(r.catalog.length,3);
 assert.equal(run(copy()),0);
});
test('一個人一天只寄一封（待送和已送合計）',()=>{
 const dir=copy();
 write(dir,'letters/delivered/'+P+'__'+C+'__'+TODAY+'.json',letter(P,C,TODAY,{delivered_on:'2026-10-09'}));
 assert.ok(fatal(dir).some(i=>i.kind.includes('只能寄一封')));
 assert.equal(run(dir),1);
});
test('待送的信不能寫未來日期；已過寄出日只提醒',()=>{
 let dir=copy();
 write(dir,'letters/pending/'+C+'__'+P+'__2026-10-09.json',letter(C,P,'2026-10-09'));
 assert.equal(run(dir),1);
 dir=copy();
 const r=checkRepo(dir,{today:'2026-10-09'});
 assert.deepEqual(r.issues.filter(i=>i.fatal),[]);
 assert.ok(r.issues.some(i=>!i.fatal&&i.kind.includes('deliver_letters')));
});
test('已送的信，送達日要晚於寄出日',()=>{
 const dir=copy();
 write(dir,'letters/delivered/'+C+'__'+P+'__2026-10-07.json',letter(C,P,'2026-10-07',{delivered_on:'2026-10-07'}));
 assert.equal(run(dir),1);
});
test('沒有轉寄欄、不放外部連結或 LINE、不超過 200 字、檔名要對、不能寄給自己',()=>{
 const bad=[
   letter(P,C,TODAY,{forward_to:'aiwff-main-brain'}),
   letter(P,C,TODAY,{body:'看這裡 https://example.invalid'}),
   letter(P,C,TODAY,{body:'加我 line.me/ti/p/FAKE'}),
   letter(P,C,TODAY,{body:'字'.repeat(201)}),
   letter(P,C,TODAY,{price:1}),
 ];
 for(const l of bad){
   const dir=copy();
   safeRm(dir,'letters/pending');
   write(dir,'letters/pending/'+P+'__'+C+'__'+TODAY+'.json',l);
   assert.equal(run(dir),1,JSON.stringify(l).slice(0,60));
 }
 let dir=copy();
 write(dir,'letters/pending/wrong-name.json',letter(C,P,TODAY));
 assert.equal(run(dir),1);
 dir=copy();
 write(dir,'letters/pending/'+C+'__'+C+'__'+TODAY+'.json',letter(C,C,TODAY));
 assert.equal(run(dir),1);
});
test('送信：只送寄出日早於今天的，加上送達日，送完仍通過檢查',()=>{
 const dir=copy();
 assert.deepEqual(deliver(dir,TODAY).moved,[]);
 const {moved,kept}=deliver(dir,'2026-10-09');
 assert.deepEqual(moved,[P+'__'+C+'__2026-10-08.json']);assert.deepEqual(kept,[]);
 const l=JSON.parse(fs.readFileSync(path.join(dir,'letters/delivered',moved[0]),'utf8'));
 assert.equal(l.delivered_on,'2026-10-09');
 assert.equal(fs.existsSync(path.join(dir,'letters/pending',moved[0])),false);
 assert.equal(run(dir,'2026-10-09'),0);
});
test('送信 --dry-run 不動檔；CLI 可指定今天',()=>{
 const dir=copy();
 const out=cp.spawnSync(process.execPath,[path.join(root,'scripts/deliver_letters.js'),'--root',dir,'--today','2026-10-09','--dry-run'],{encoding:'utf8'});
 assert.equal(out.status,0);assert.match(out.stdout,/會送出/);
 assert.equal(fs.readdirSync(path.join(dir,'letters/pending')).length,1);
});
test('足跡：只能去別人的房間、一行一個 JSON、note 40 字內、不放連結',()=>{
 for(const line of ['{"room":"example-person","date":"2026-10-07"}','not json','{"room":"example-company","date":"2026-10-07","note":"'+'字'.repeat(41)+'"}','{"room":"example-company","date":"2026-10-07","note":"www.example.invalid"}','{"room":"example-company","date":"2026-10-09"}','{"room":"nobody","date":"2026-10-07"}']){
   const dir=copy();
   write(dir,'footprints/example-person.jsonl',line+'\n');
   assert.equal(run(dir),1,line);
 }
 const dir=copy();
 write(dir,'footprints/nobody.jsonl','{"room":"example-person","date":"2026-10-07"}\n');
 assert.equal(run(dir),1);
});
test('公共目錄由來源即時計算，忽略舊產物',()=>{
 const dir=copy();
 write(dir,'catalog.json','[]');
 assert.equal(run(dir),0);
 assert.equal(checkRepo(dir).catalog.length,3);
});
test('台北日曆日：UTC 16:00 已是台北隔天',()=>{
 assert.equal(taipeiToday(new Date('2026-10-08T15:59:00Z')),'2026-10-08');
 assert.equal(taipeiToday(new Date('2026-10-08T16:00:00Z')),'2026-10-09');
});
