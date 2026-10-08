'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {checkRepo,taipeiToday}=require('./check_members');
const {buildWorld}=require('./build_world');
function keywords(s){return new Set((String(s).toLowerCase().match(/[a-z0-9]{2,}|[\u3400-\u9fff]+/g)||[]).flatMap(w=>/[\u3400-\u9fff]/.test(w)?Array.from({length:Math.max(0,w.length-1)},(_,i)=>w.slice(i,i+2)):[w]));}
function suggest(world,catalog,{now=new Date()}={}){
 const suggestions=[],day=taipeiToday(now),households=world.households||[],byId=new Map(households.map(h=>[h.id,h]));
 const add=(kind,from,to,text)=>suggestions.push({id:crypto.createHash('sha256').update(JSON.stringify([day,kind,from,to,text])).digest('hex'),kind,from,to,text,advisory_only:true,requires_owner_consent:true});
 for(const h of households){const terms=keywords(h.missing);if(!terms.size)continue;
 const hits=catalog.filter(m=>m.owner!==h.id&&byId.has(m.owner)&&m.rights_ok!==false&&m.desensitized_ok!==false).map(m=>({m,score:[...keywords(m.title+' '+m.ref)].filter(w=>terms.has(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.m.ref.localeCompare(b.m.ref));
 if(hits.length){const m=hits[0].m;add('match',h.id,m.owner,'村民資料引用：'+JSON.stringify({handle:h.handle,missing:h.missing,neighbor:byId.get(m.owner).handle,title:m.title})+'。建議：取得主人同意後，可詢問彼此。');}}
 for(const h of households)if(h.moved_in_at&&now-new Date(h.moved_in_at)>=3*86400000&&!(world.events||[]).some(e=>e.type==='visit'&&e.to===h.id))add('welcome',null,h.id,'村民代號引用：'+JSON.stringify(h.handle)+'。搬進來三天，尚無來訪足跡；取得主人同意後，可打聲招呼。');
 return {generated_at:now.toISOString(),suggestions:suggestions.slice(0,10)};
}
function buildPatrol(root=path.resolve(__dirname,'..'),out=path.join(root,'_site/patrol.json')){const worldPath=path.join(root,'_site/village_world.json'),world=fs.existsSync(worldPath)?JSON.parse(fs.readFileSync(worldPath)):buildWorld(root,null),r=checkRepo(root),catalog=r.catalog.map(c=>({...c,...r.materials.get(c.ref)})),result=suggest({...world,events:[...world.events,...r.footprints.map(f=>({type:"visit",to:f.room}))]},catalog);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');return result;}
if(require.main===module)buildPatrol();
module.exports={keywords,suggest,buildPatrol};
