const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {mkTmp}=require('./_tmp'),{build,intake}=require('../scripts/intake'),{intakeEvent}=require('../scripts/intake_from_event'),{checkMember,checkRepo}=require('../scripts/check_members'),{buildWorld}=require('../scripts/build_world'),{YARD_DEFAULTS,resolveYard}=require('../scripts/yard');
const root=path.resolve(__dirname,'..'),post=fs.readFileSync(path.join(__dirname,'fixtures/intake/starter-person.md'),'utf8');
const event=body=>({action:'edited',sender:{login:'starter'},discussion:{user:{login:'starter',id:102},category:{slug:'check-in'},body}});
const read=(base,rel)=>JSON.parse(fs.readFileSync(path.join(base,rel)));
function git(base,...argv){const r=cp.spawnSync('git',['-C',base,...argv],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
test('old members pass without yard; world resolves defaults and explicit pine',()=>{
 const base=mkTmp('starter-world-');require('./_public_fixture').seed(base);
 assert.deepEqual(checkRepo(base).issues.filter(i=>i.fatal),[]);
 git(base,'init');git(base,'add','.');git(base,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');
 let world=buildWorld(base,null);assert.ok(world.households.length);assert.ok(world.households.every(h=>JSON.stringify(h.yard)===JSON.stringify(YARD_DEFAULTS)));
 const file=path.join(base,'members/fixture-person.json'),member=read(base,'members/fixture-person.json');member.yard={tree:'tree_pine',lamp:'lamp',fence:'fence'};fs.writeFileSync(file,JSON.stringify(member));
 assert.deepEqual(buildWorld(base,null).households.find(h=>h.id==='fixture-person').yard,member.yard);
 assert.deepEqual(resolveYard({tree:'tree_pine'}),member.yard);
});
test('minimal form creates N+1 with six empty slots and valid yard',()=>{
 const base=require('./_fixture').fixture('starter-minimal-'),before=checkRepo(base).n;
 assert.equal(intake(post,'starter',base).ok,true);
 assert.equal(checkRepo(base).n,before+1);assert.deepEqual(checkRepo(base).issues.filter(i=>i.fatal),[]);
 assert.deepEqual(read(base,'members/starter.json').yard,{tree:'tree_pine',lamp:'lamp',fence:'fence'});
 assert.deepEqual(read(base,'rooms/starter/room.json').slots,Array.from({length:6},()=>({type:'empty'})));
});
test('illegal yard never writes; schema refuses null, arrays, wrong values and extra keys',()=>{
 for(const yard of [null,[],{tree:'bad'},{tree:3},{lamp:'bad'},{fence:'bad'},{rarity:'rare'},{other:true}])assert.ok(checkMember({type:'person',handle:'小河',avatar:4,intro:'介紹',owner_consent:true,yard}).some(i=>i.fatal));
 const base=mkTmp('starter-invalid-');assert.equal(intake(post.replace('tree_pine','bad'),'starter',base).ok,false);assert.equal(fs.existsSync(path.join(base,'members/starter.json')),false);
 for(const [label,value] of [['院子的燈','bad'],['院子的籬笆','bad']])assert.ok(build(post+'\n### '+label+'\n'+value,'starter').errors.length);
});
test('room still rejects yard',()=>{
 const base=mkTmp('starter-room-');assert.equal(intakeEvent(event(post),base).ok,true);
 const file=path.join(base,'rooms/starter/room.json'),room=read(base,'rooms/starter/room.json');room.yard={tree:'tree_pine'};fs.writeFileSync(file,JSON.stringify(room));assert.ok(checkRepo(base).issues.some(i=>i.fatal&&i.file.includes('room.json')));
});
test('company, demo and consent conditions remain required',()=>{
 for(const body of [post.replace('個人＋AI','一人公司或公司＋AI'),post.replace('個人＋AI','示範戶（不計入戶數）'),post.replace('[X]','[ ]')])assert.ok(build(body,'starter').errors.length);
});
test('short-form edit preserves autobiography, works, card and yard; explicit tree changes',()=>{
 const base=mkTmp('starter-update-');assert.equal(intakeEvent(event(post),base).ok,true);
 const file=path.join(base,'members/starter.json'),member=read(base,'members/starter.json');Object.assign(member,{body:'終端機',model:'模型',memory:'筆記',duration:'一年',proudest:'小圖',works:[{title:'小圖',description:'我畫的'}],looking_for:'畫友',card:{public_ok:false},yard:{tree:'tree_pine',lamp:'lamp',fence:'fence'}});fs.writeFileSync(file,JSON.stringify(member));
 const short=post.replace('### 院子的樹（選填）\ntree_pine\n','');assert.equal(intakeEvent(event(short),base).ok,true);assert.deepEqual(read(base,'members/starter.json'),member);
 assert.equal(intakeEvent(event(post.replace('tree_pine','tree_round')),base).ok,true);assert.equal(read(base,'members/starter.json').yard.tree,'tree_round');
 assert.equal(intakeEvent(event(post.replace('tree_pine','invalid')),base).ok,false);assert.equal(read(base,'members/starter.json').yard.tree,'tree_round');
});
test('editing original short check-in can add SVG with unchanged per-slot rules',()=>{
 const base=mkTmp('starter-svg-');assert.equal(intakeEvent(event(post),base).ok,true);
 const full=fs.readFileSync(path.join(__dirname,'fixtures/demo-check-in.md'),'utf8'),materials=full.slice(full.indexOf('### 素材一'),full.indexOf('### 主人同意'));
 assert.equal(intakeEvent(event(post+'\n'+materials),base).ok,true);assert.ok(fs.existsSync(path.join(base,'materials/starter/item-1.svg')));
 const bad=mkTmp('starter-svg-bad-'),r=intakeEvent(event(post+'\n'+materials.replace('- [X] 素材一權利','- [ ] 素材一權利')),bad);assert.equal(r.ok,true);assert.ok(r.warnings.length);assert.equal(fs.existsSync(path.join(bad,'materials/starter/item-1.svg')),false);
});
test('actual yard card counts match visible capped households; public layout stays unchanged',async()=>{
 const v=await import('../site/world/village.js'),T=await import('../site/world/assets/vendor/js/three/three.module.min.js'),scene=new T.Scene();
 const before=v.propLayout();assert.equal(before.tree_round.length+before.tree_pine.length,24);assert.equal(before.lamp.length,18);assert.equal(before.fence.length,6);
 for(const n of [0,1,25,512,513]){
 const homes=Array.from({length:n},(_,i)=>({id:'home-'+i,position:{x:i%2?22:-22,z:42-i*27},...(i%2?{yard:{tree:'tree_pine'}}:{})}));
 const cards=v.buildYardCards(scene,homes);assert.equal(cards.meshes.tree_round.count+cards.meshes.tree_pine.count,Math.min(n,512));assert.equal(cards.meshes.lamp.count,0);assert.equal(cards.meshes.fence.count,0);assert.equal(cards.shadows.count,Math.min(n,512));cards.update({position:{x:0,z:100}});v.removeYardCards(scene,cards);assert.equal(scene.children.length,0);
 }
 assert.deepEqual(v.propLayout(),before);
});
test('form has exactly five required fields, optional tree and two conditional fields',()=>{
 const s=fs.readFileSync(path.join(root,'.github/DISCUSSION_TEMPLATE/check-in.yml'),'utf8');assert.equal((s.match(/required: true/g)||[]).length,5);assert.equal((s.match(/    id:/g)||[]).length,8);assert.match(s,/id: yard-tree/);assert.doesNotMatch(s,/id: (body|model|memory|works|card|material-)/);
});
test('machine check-in templates only show the short form and yard enums',()=>{
 for(const file of ['AGENTS.md','llms.txt']){const s=fs.readFileSync(path.join(root,file),'utf8'),template=s.slice(s.indexOf('## 報到模板'),s.indexOf('## 互換模板'));assert.doesNotMatch(template,/### (身體|底層模型|長期記憶|作品|名片|素材)/);assert.match(template,/### 院子的樹/);assert.match(s,/tree_round.*tree_pine/);}
});
