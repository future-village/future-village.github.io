'use strict';
const fs=require('node:fs'),path=require('node:path');
const {checkRepo}=require('./check_members');
const {buildWelcome}=require('./build_welcome');
function buildSite(root=path.resolve(__dirname,'..'),out=path.join(root,'_site')) {
const directory=path.join(root,'members');
if(fs.existsSync(out)) throw new Error('Output directory already exists');
fs.mkdirSync(out,{recursive:true});
for(const d of ['site','assets'])fs.cpSync(path.join(root,d),path.join(out,d),{recursive:true});
fs.cpSync(path.join(root,'site/world'),path.join(out,'world'),{recursive:true});
const result=checkRepo(root);
if(result.issues.some(i=>i.fatal&&!(i.field==='owner_consent'&&i.file.startsWith('members/')))) throw new Error('請先修正 check_members.js 回報的失敗');
const members=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).sort().map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))).filter(m=>m.owner_consent===true&&m.draft!==true);
for(const m of members)for(const card of [m.card,m.company?.card])if(card && card.public_ok!==true)delete card.contact;
const visible=new Set(members.map(m=>m.id));
for(const slug of visible)if(fs.existsSync(path.join(root,'materials',slug)))fs.cpSync(path.join(root,'materials',slug),path.join(out,'materials',slug),{recursive:true});
const avatars=JSON.parse(fs.readFileSync(path.join(root,'assets/avatars/index.json'),'utf8'));
// 房間只放已過檢查的格子內容：素材標題、出處、作者、圖檔路徑；互換格多記對方是誰。
const material=ref=>{const m=result.materials.get(ref);return {ref,title:m.title,source:m.source,owner:m.owner,made_by:m.made_by,svg:'materials/'+ref+'.svg'}};
const rooms={};
for(const [slug,room] of result.rooms)if(visible.has(slug))rooms[slug]={missing:room.missing||'',slots:room.slots.map(s=>s.material&&!visible.has(s.material.split('/')[0])?{type:'empty'}:s.type==='own'?{type:'own',...material(s.material)}:s.type==='swap'?{type:'swap',...material(s.material)}:{type:'empty'})};
// 信：房間只看得到已送的內容；待送的只顯示「在路上」幾封。足跡依房間分組。
const handle=id=>result.members.get(id)?.handle||id;
for(const slug of Object.keys(rooms)){
 rooms[slug].letters=result.letters.delivered.filter(l=>l.to===slug&&visible.has(l.from)).sort((a,b)=>b.delivered_on.localeCompare(a.delivered_on)).map(l=>({from:handle(l.from),date:l.date,delivered_on:l.delivered_on,body:l.body,ai_written:l.ai_written===true}));
 rooms[slug].on_the_way=result.letters.pending.filter(l=>l.to===slug&&visible.has(l.from)).length;
 rooms[slug].footprints=result.footprints.filter(f=>f.room===slug&&visible.has(f.visitor)).sort((a,b)=>b.date.localeCompare(a.date)).map(f=>({visitor:handle(f.visitor),date:f.date,note:f.note||''}));
}
// 公共目錄只在部署輸出，來源由檢查器即時計算
const catalog=result.catalog.filter(c=>visible.has(c.owner)).map(c=>({...c,svg:'materials/'+c.ref+'.svg'}));
for(const name of ['llms.txt','AGENTS.md','RULES.md'])fs.copyFileSync(path.join(root,name),path.join(out,name));
fs.cpSync(path.join(root,'library'),path.join(out,'library'),{recursive:true});
for(const m of members){fs.mkdirSync(path.join(out,'members'),{recursive:true});fs.writeFileSync(path.join(out,'members',m.id+'.json'),JSON.stringify(m,null,2)+'\n');if(result.rooms.has(m.id)){fs.mkdirSync(path.join(out,'rooms',m.id),{recursive:true});fs.copyFileSync(path.join(root,'rooms',m.id,'room.json'),path.join(out,'rooms',m.id,'room.json'));}}
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(out,'site/members.json'),JSON.stringify(members,null,2)+'\n');
let html=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const data=JSON.stringify({members,avatars,rooms,catalog,n:result.n}).replace(/</g,'\\u003c');
html=html.replace(/(<script id="member-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,open,close)=>open+data+close);
fs.writeFileSync(path.join(out,'site/index.html'),html);
buildWelcome(root,out,result);
console.log('已更新 '+members.length+' 張卡片、'+Object.keys(rooms).length+' 間房、目錄 '+catalog.length+' 件、members.json 與離線內嵌索引；N = '+result.n+'。');

return {members,rooms,catalog};
}
if(require.main===module)buildSite();
module.exports={buildSite};
