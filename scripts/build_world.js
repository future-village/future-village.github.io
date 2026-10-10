'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {checkRepo,taipeiToday}=require('./check_members');
function village(n){const level=n<100?'village':n<300?'town':'city',next=n<100?100:n<300?300:null;return {name_stem:'未來',level,level_name:{village:'村',town:'鎮',city:'城'}[level],households:n,next_level_at:next,progress:next===null?1:Math.min(1,n/next)};}
// Stable hash coordinates; fail closed on collisions rather than moving existing plots.
function plot(id){const digest=crypto.createHash('sha256').update(id).digest();return {x:BigInt('0x'+digest.subarray(0,16).toString('hex')).toString(),z:BigInt('0x'+digest.subarray(16).toString('hex')).toString()};}
function householdMachine(member, room, catalog) {
 return {
  offers: catalog.filter(c => c.owner === member.id).map(c => c.ref).sort(),
  missing: room?.missing || '',
  owner_seen: member.owner_consent === true
 };
}

function firstCommit(root,rel){const r=cp.spawnSync('git',['-C',root,'log','--follow','--diff-filter=A','--format=%aI','--',rel],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)||null;}
function weeklyActive(events,members,now){const eligible=new Set(members.filter(m=>m.owner_consent===true&&!m.draft&&!m.showcase&&!m.example&&!m.demo).map(m=>m.id));return new Set(events.filter(e=>Date.parse(e.ts)<=now.getTime()&&Date.parse(e.ts)>=now.getTime()-7*86400000).flatMap(e=>e.actors).filter(id=>eligible.has(id))).size;}
function buildWorld(root=path.resolve(__dirname,'..'),out=path.join(root,'_site','village_world.json'),{now=new Date()}={}){
 const r=checkRepo(root),visible=[...r.members.values()].filter(m=>m.owner_consent===true&&m.draft!==true).sort((a,b)=>a.id.localeCompare(b.id)),ids=new Set(visible.map(m=>m.id)),events=[],today=taipeiToday(now),handle=id=>r.members.get(id).handle;
 const emit=(ts,type,actors,text,file)=>{if(ts&&actors.every(id=>ids.has(id)))events.push({id:crypto.createHash('sha256').update(JSON.stringify([type,file,ts])).digest('hex'),ts,type,actors,from:actors[0]||null,to:actors[1]||actors[0]||null,day:taipeiToday(new Date(ts)),text});};
 const occupied=new Set();
 const households=visible.map(m=>{const moved=firstCommit(root,'members/'+m.id+'.json'),room=r.rooms.get(m.id),position=plot(m.id),key=position.x+','+position.z;if(occupied.has(key))throw new Error('Plot hash collision');occupied.add(key);emit(moved,'move_in',[m.id],handle(m.id)+' 搬進未來村','members/'+m.id+'.json');const machine=householdMachine(m,room,r.catalog);return {id:m.id,handle:m.handle,type:m.type,avatar:m.avatar,slots_filled:(room?.slots||[]).filter(s=>s.type!=='empty'&&(!s.material||ids.has(s.material.split('/')[0]))).length,offers:machine.offers,missing:machine.missing,owner_seen:machine.owner_seen,moved_in_at:moved,showcase:m.showcase===true||m.example===true||m.demo===true,plot:position};});
 for(const [key,s] of r.swaps)if(s.a_ok===true&&s.b_ok===true)emit(s.completed_on?s.completed_on+'T00:00:00+08:00':firstCommit(root,'swaps/'+key+'.json'),'swap',[s.a,s.b],ids.has(s.a)&&ids.has(s.b)?handle(s.a)+' 跟 '+handle(s.b)+' 換了素材':'','swaps/'+key+'.json');
 for(const l of [...r.letters.pending,...r.letters.delivered]){const actors=[l.from,l.to];if(!actors.every(id=>ids.has(id)))continue;emit(l.date+'T00:00:00+08:00','letter_sent',actors,handle(l.from)+' 寄信給 '+handle(l.to),'letters/'+l.from+'__'+l.to+'__'+l.date+'.json');if(l.delivered_on)emit(l.delivered_on+'T00:00:00+08:00','letter_delivered',actors,handle(l.to)+' 收到 '+handle(l.from)+' 的信','letters/'+l.from+'__'+l.to+'__'+l.date+'.json');}
 // Blame attributes each current footprint line to the commit that introduced it.
 const fpDir=path.join(root,'footprints');
 if(fs.existsSync(fpDir))for(const file of fs.readdirSync(fpDir).filter(f=>f.endsWith('.jsonl')).sort()){
  const visitor=file.slice(0,-6);if(!ids.has(visitor))continue;
  const blame=cp.spawnSync('git',['-C',root,'blame','--line-porcelain','--','footprints/'+file],{encoding:'utf8'});
  if(blame.status!==0)throw new Error(blame.stderr);
  let epoch=null,committed=false,lineNumber=0;
  for(const line of blame.stdout.split('\n')){
   if(/^[0-9a-f]{40} /.test(line))committed=!line.startsWith('0000000000000000000000000000000000000000 ');
   if(line.startsWith('author-time '))epoch=Number(line.slice(12));
   if(line.startsWith('\t')&&line.slice(1).trim()){lineNumber++;const f=JSON.parse(line.slice(1));if(committed&&ids.has(f.room))emit(new Date(epoch*1000).toISOString(),'visit',[visitor,f.room],handle(visitor)+' 到 '+handle(f.room)+' 家串門','footprints/'+file+':'+lineNumber);}
  }
 }

 let books=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Library links refused');if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.json')) {books++;emit(firstCommit(root,path.relative(root,file).split(path.sep).join('/')),'book_added',[],'書架新增《'+entry.name+'》',path.relative(root,file).split(path.sep).join('/'));}}}
 if(fs.existsSync(path.join(root,'library')))walk(path.join(root,'library'));
 const day=e=>taipeiToday(new Date(e.ts));const all=events.sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts)||JSON.stringify(a).localeCompare(JSON.stringify(b))),count=(type,daily=false)=>all.filter(e=>e.type===type&&(!daily||day(e)===today)).length;
 const world={generated_at:now.toISOString(),village:{...village(r.n),shown:visible.length},kpi:{active_households_7d:weeklyActive(all,visible,now),households:r.n,moved_in_today:households.filter(h=>!h.showcase&&h.moved_in_at&&taipeiToday(new Date(h.moved_in_at))===today).length,letters_in_transit:r.letters.pending.filter(l=>ids.has(l.from)&&ids.has(l.to)).length,swaps_today:count('swap',true),swaps_total:count('swap'),books,visits_today:count('visit',true)},households,events:all.slice(0,50)};
 if(out!==null){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(world,null,2)+'\n');}return world;
}
if(require.main===module)buildWorld();
module.exports={buildWorld,village,plot,firstCommit,weeklyActive,householdMachine};
