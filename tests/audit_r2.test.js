'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const {mkTmp}=require('./_tmp'),{build,parsePost}=require('../scripts/intake'),{intakeEvent}=require('../scripts/intake_from_event'),{checkMember}=require('../scripts/check_members'),{suggest}=require('../scripts/build_patrol'),{sweep,signature,eventOf,receive,receiptMatches}=require('../scripts/intake_sweep');
const root=path.resolve(__dirname,'..'),body=fs.readFileSync(path.join(__dirname,'fixtures/intake/good-form.md'),'utf8').replace(/\r\n/g,'\n');
const event=(post=body,id=101)=>({action:'created',sender:{login:'resident'},discussion:{user:{login:'resident',id},category:{slug:'check-in'},body:post}});
const read=(base,rel)=>JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));
test('invalid optional works only warn; private works still reject the entire post',()=>{
 const base=mkTmp('r-two-'),r=intakeEvent(event(body+'\n### 作品\n1. no separator'),base);
 assert.equal(r.ok,true);assert.ok(r.warnings.some(w=>w.includes('作品')));assert.equal(read(base,'members/resident.json').works,undefined);
 assert.equal(intakeEvent(event(body+'\n### 作品\n1. bad：https://example.invalid'),mkTmp('r-two-')).ok,false);
 assert.equal(intakeEvent(event(body+'\n### 作品\n1. bad：0912-000-000'),mkTmp('r-two-')).ok,false);
});
test('missing rejects external links and overlength before any member write',()=>{
 for(const missing of ['https://example.invalid','example.com','x'.repeat(61)]){
  const base=mkTmp('r-two-'),post=body.replace('想掛一件別人畫的小地圖',missing);
  assert.equal(intakeEvent(event(post),base).ok,false);assert.equal(fs.existsSync(path.join(base,'members')),false);
 }
});
test('unapproved contact is omitted; approved phone/email retained; contact URL blocked',()=>{
 for(const [contact,public_ok,ok] of [['@resident',false,true],['0912-000-000',true,true],['resident@example.invalid',true,true],['https://example.invalid',true,false]]){
  const base=mkTmp('r-two-'),r=intakeEvent(event(body+'\n### 名片\n'+JSON.stringify({contact,public_ok})),base);assert.equal(r.ok,ok);
  if(ok)assert.equal(read(base,'members/resident.json').card.contact,public_ok?contact:undefined);
 }
 assert.ok(checkMember({type:'person',handle:'R',intro:'Hi',avatar:1,owner_consent:true,card:{contact:'www.example.invalid',public_ok:true}}).some(i=>i.fatal));
});
test('stable account id rejects reused login and legacy record without changing bytes',()=>{
 const base=mkTmp('r-two-');assert.equal(intakeEvent(event(),base).ok,true);
 const file=path.join(base,'members/resident.json'),before=fs.readFileSync(file,'utf8');assert.equal(read(base,'members/resident.json').github_id,101);
 assert.equal(intakeEvent(event(body,202),base).ok,false);assert.equal(fs.readFileSync(file,'utf8'),before);
 assert.equal(intakeEvent(event(),base).ok,true);
 const legacy=read(base,'members/resident.json');delete legacy.github_id;fs.writeFileSync(file,JSON.stringify(legacy));assert.equal(intakeEvent(event(),base).ok,false);
 const missing=event();delete missing.discussion.user.id;assert.equal(intakeEvent(missing,mkTmp('r-two-')).ok,false);
 assert.equal(eventOf({author:{login:'resident',databaseId:101},category:{slug:'check-in'},body}).discussion.user.id,101);
});
test('unmodified AI templates fail owner consent and contain no preset checks',()=>{
 for(const file of ['AGENTS.md','llms.txt']){const text=fs.readFileSync(path.join(root,file),'utf8'),template=text.match(/```markdown\r?\n([\s\S]*?)```/)[1];assert.equal(parsePost(template).checks.consent,false);assert.ok(build(template,'resident').errors.some(e=>e.includes('主人同意')));assert.doesNotMatch(template,/- \[[xX]\]/);}
});
test('long original body does not grow during reconstruction; CLI exceptions are structured',()=>{
 const post=body+'\n'+('### 未映射\nhi\n'.repeat(900));assert.ok(post.length<20000);const result=intakeEvent(event(post),mkTmp('r-two-'));assert.equal(result.ok,true);
 const base=mkTmp('r-two-'),file=path.join(base,'event.json');fs.writeFileSync(file,'{bad');const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/intake_from_event.js'),file,base],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).ok,false);
});
test('showcase households excluded from matching and welcome',()=>{
 const world={households:[{id:'real',handle:'R',missing:'地圖'},{id:'example',handle:'E',showcase:true,missing:'地圖',moved_in_at:'2026-01-01'}],events:[]};assert.deepEqual(suggest(world,[{owner:'example',ref:'example/map',title:'地圖'}]).suggestions,[]);
});
test('malformed hashes decode to empty without stopping later render setup',()=>{
 const source=fs.readFileSync(path.join(root,'site/app.js'),'utf8'),definition=source.match(/const safeDecode=.*?;\r?\n/)[0];assert.equal(vm.runInNewContext(definition+"safeDecode('%')"),'');assert.equal(vm.runInNewContext(definition+"safeDecode('little%20river')"),'little river');assert.doesNotMatch(source,/const id=decodeURIComponent|want.value=decodeURIComponent/);
});
test('sweep processing is bounded and queued receipts expire and ignore spoofers',async()=>{
 const d={author:{login:'resident',databaseId:101},body,category:{slug:'check-in'},id:'d',number:1},mark='<!-- future-village-intake:'+signature(d)+' -->';
 assert.equal(receiptMatches({author:{login:'github-actions[bot]'},body:mark},d,mark),true);
 const queue='<!-- future-village-queue:'+signature(d)+':2000 -->';assert.equal(receiptMatches({author:{login:'github-actions[bot]'},body:queue},d,mark,1000),true);assert.equal(receiptMatches({author:{login:'github-actions[bot]'},body:queue},d,mark,2000),false);assert.equal(receiptMatches({author:{login:'resident'},body:mark},d,mark),false);
 let calls=0;const results=await sweep(()=>({nodes:Array.from({length:30},(_,i)=>({...d,number:i})),pageInfo:{hasNextPage:false}}),()=>false,()=>{calls++;return {ok:true}});assert.equal(calls,25);assert.equal(results.length,25);
});
test('deterministic data gate failure writes reason and never reruns the claimed version',async()=>{
 const d={author:{login:'resident',databaseId:101},body,category:{slug:'check-in'},id:'d',number:1},comments=[];let gates=0;
 const mocked=mock.method(cp,'spawnSync',(command,argv)=>{
  if(command==='gh'){
   if(argv.includes('users/resident'))return {status:0,stdout:JSON.stringify({created_at:'2020-01-01'}),stderr:''};
   if(argv.includes('graphql')){comments.push(argv.find(a=>a.startsWith('body=')).slice(5));return {status:0,stdout:JSON.stringify({data:{}}),stderr:''};}
  }
  if(command===process.execPath){if(argv[0]==='scripts/check_members.js'){gates++;return {status:1,stdout:'',stderr:'invalid data'};}return {status:0,stdout:JSON.stringify({ok:true,branch:'intake/resident',warnings:[]}),stderr:''};}
  return {status:0,stdout:'',stderr:''};
 });
 try{
  const page=()=>({nodes:[d],pageInfo:{hasNextPage:false}}),receipt=(d,mark)=>comments.some(body=>receiptMatches({author:{login:'github-actions[bot]'},body},d,mark));
  const first=await sweep(page,receipt,(d,mark)=>receive(d,mark,[]));assert.equal(first[0].rejected,true);assert.equal(gates,1);assert.ok(comments[0].includes('開始代收'));assert.ok(comments[1].includes('資料閘失敗'));assert.deepEqual(await sweep(page,receipt,(d,mark)=>receive(d,mark,[])),[]);assert.equal(gates,1);
 }finally{mocked.mock.restore();}
});
