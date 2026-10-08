const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mkTmp}=require('./_tmp'),{build}=require('../scripts/intake'),{intakeEvent}=require('../scripts/intake_from_event'),{checkRepo,checkMember}=require('../scripts/check_members');
const sample=fs.readFileSync(path.join(__dirname,'fixtures/demo-check-in.md'),'utf8').replace(/\r\n/g,'\n');
const event=body=>({action:'created',sender:{login:'demo-resident'},discussion:{user:{login:'demo-resident',id:101},category:{slug:'check-in'},body}});
const read=(base,rel)=>JSON.parse(fs.readFileSync(path.join(base,rel)));
test('demo needs authorizer; display handle accepts dot and 40 code points but refuses 41',()=>{
 assert.ok(build(sample.replace('### 由誰授權（選了示範戶才要填）\n隊長','### 由誰授權（選了示範戶才要填）\n_No response_'),'demo').errors.some(e=>e.includes('授權人')));
 for(const [handle,ok] of [['星・河',true],['星'.repeat(40),true],['星'.repeat(41),false],['🌱'.repeat(40),true]]){
 const result=build(sample.replace('隊長家的孩子・小伯',handle),'demo');assert.equal(result.errors.length===0,ok);
 assert.equal(checkMember({...result.files['members/demo.json']}).filter(i=>i.fatal).length===0,ok);
 }
});
test('each material rejects missing checks or invalid AI independently; all three marks survive',()=>{
 for(const [text,value] of [['人做的','human'],['AI 代筆','ai_marked'],['人做 AI 修','ai_assisted']]){
 const base=mkTmp('polish-'),result=intakeEvent(event(sample.replace('AI 代筆\n',text+'\n')),base);
 assert.equal(result.ok,true);assert.deepEqual(result.warnings,[]);assert.equal(read(base,'materials/demo-resident/item-1.json').made_by,value);assert.equal(checkRepo(base).n,0);
 }
 for(const n of [1,2])for(const field of ['權利','去敏']){
 const word=n===1?'一':'二',base=mkTmp('polish-');const result=intakeEvent(event(sample.replace('- [X] 素材'+word+field,'- [ ] 素材'+word+field)),base);
 assert.equal(result.ok,true);assert.ok(result.warnings.length);assert.equal(fs.existsSync(path.join(base,'materials/demo-resident/item-'+n+'.json')),false);assert.ok(fs.existsSync(path.join(base,'materials/demo-resident/item-'+(3-n)+'.json')));
 }
 const base=mkTmp('polish-'),result=intakeEvent(event(sample.replace('AI 代筆\n','_No response_\n')),base);assert.equal(result.ok,true);assert.ok(result.warnings.length);assert.equal(read(base,'rooms/demo-resident/room.json').slots.filter(s=>s.type==='own').length,1);
});
test('updates keep other own and swap slots; no empty slot rejects only new material',()=>{
 const base=mkTmp('polish-');intakeEvent(event(sample),base);const file=path.join(base,'rooms/demo-resident/room.json');
 const slots=Array.from({length:6},(_,i)=>({type:i===0?'own':'swap',material:i===0?'demo-resident/item-1':'other/item-'+i}));fs.writeFileSync(file,JSON.stringify({owner:'demo-resident',slots}));
 const result=intakeEvent(event(sample),base);assert.equal(result.ok,true);assert.ok(result.warnings.some(w=>w.includes('空格')));assert.deepEqual(read(base,'rooms/demo-resident/room.json').slots,slots);
});
test('render sources have badges and activity count without upgrade countdown or progress element',()=>{
 const root=path.join(__dirname,'..');for(const rel of ['site/index.html','site/app.js','site/world/village.js']){const text=fs.readFileSync(path.join(root,rel),'utf8');assert.doesNotMatch(text,/再\s*\d+\s*戶升格|還差\s*\d+\s*戶|<progress|next_level_at/);}
});
test('roadside allocation is exactly households plus six',async()=>{const {roadsidePlots,model}=await import('../site/world/data.mjs');for(const n of [0,3,100]){assert.equal(roadsidePlots(n+6).length,n+6);assert.ok(roadsidePlots(n+6).every(p=>Math.abs(p.x)===22));const world=model({village:{},events:[],households:Array.from({length:n},(_,i)=>({id:'home-'+i}))});assert.equal(world.households.length,n);}});
test('seven day active households deduplicate all actors and exclude demos, captain and examples',()=>{
 const {weeklyActive}=require('../scripts/build_world'),now=new Date('2026-10-08T12:00:00Z');
 const members=[{id:'real',owner_consent:true},{id:'neighbor',owner_consent:true},{id:'demo',owner_consent:true,demo:true},{id:'captain',owner_consent:true,showcase:true},{id:'example',owner_consent:true,example:true},{id:'draft',owner_consent:true,draft:true}];
 const events=[{ts:'2026-10-08T10:00:00Z',actors:['real','demo','captain','example','draft']},{ts:'2026-10-01T12:00:00Z',actors:['neighbor','real']}];
 assert.equal(weeklyActive(events,members,now),2);assert.equal(weeklyActive(events,members,new Date(now.getTime()+1)),1);
 assert.equal(weeklyActive([{ts:'2026-10-09T00:00:00Z',actors:['real']}],members,now),0);
});
test('external titles are rejected per material without weakening namespace allowance',()=>{
 for(const [title,n] of [['紙船上的小燈',1],['疊好的三塊積木',2]]){
 // Match the fixture heading independently of its explanatory suffix.
 const body=sample.replace(new RegExp('(### 素材'+(n===1?'一':'二')+'標題[^\\n]*\\n)'+title),'$1https://example.invalid/title');
 const fresh=mkTmp('polish-'),r=intakeEvent(event(body),fresh);assert.equal(r.ok,true);assert.ok(r.warnings.some(w=>w.includes('外部連結')));assert.equal(fs.existsSync(path.join(fresh,'materials/demo-resident/item-'+n+'.json')),false);assert.ok(fs.existsSync(path.join(fresh,'materials/demo-resident/item-'+(3-n)+'.json')));
 }
});
