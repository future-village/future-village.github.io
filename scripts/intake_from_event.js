const fs=require('node:fs'),path=require('node:path');
const {build,parsePost}=require('./intake');
const {checkMember,materialSvgIssues,SLUG}=require('./check_members');
function intakeEvent(event,base=path.resolve(__dirname,'..')) {
 if(!['created','edited'].includes(event.action)||event.discussion?.category?.slug!=='check-in')return {ok:true,skipped:true};
 const login=event.discussion.user?.login;
 if(typeof login!=='string'||!login) return {ok:false,errors:['Missing author']};
 const slug=login.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,39);
 if(!SLUG.test(slug))return {ok:false,errors:['Empty account slug']};
 // Only the discussion author may submit an update; never accept a caller-selected member id.
 if(event.sender?.login?.toLowerCase()!==login.toLowerCase())return {ok:false,errors:['Only the author may update this member']};
 const target=path.join(base,'members',slug+'.json');
 if(fs.existsSync(target)) {
  const old=JSON.parse(fs.readFileSync(target,'utf8'));
  if(old.github?.toLowerCase()!==login.toLowerCase())return {ok:false,errors:['Member belongs to another account']};
 }
 const post=event.discussion.body||'';
 if(typeof post!=='string'||post.length>20000)return {ok:false,errors:['內文過長（上限 20000 字元）']};
 const parsed=parsePost(post);
 // Scan every field, including labels not mapped into the member schema. Never echo values.
 const sensitive=checkMember({type:'person',handle:'check',avatar:1,intro:parsed.fields.card ? post.replace(parsed.fields.card,'') : post,owner_consent:true}).filter(i=>i.fatal && ['台灣手機','台灣市話','Email','身分證格式','地址樣式','金鑰','本機路徑','LINE 連結'].includes(i.kind));
 if(sensitive.length)return {ok:false,errors:[...new Set(sensitive.map(i=>i.kind))],kinds:[...new Set(sensitive.map(i=>i.kind))]};
 // Build member separately so material failures cannot reject an otherwise valid member.
 const memberPost=post.split(/^###\s+(.+)$/m);
 let plain=post;
 if(memberPost.length>1) {plain=memberPost[0];for(let i=1;i<memberPost.length;i+=2)if(!/素材|權利與去敏/.test(memberPost[i]))plain+='\n### '+memberPost[i]+'\n'+memberPost[i+1];}
 else plain=post.replace(/^.*素材.*$/gm,'').replace(/<svg\b[\s\S]*?<\/svg>/gi,'');
 const basic=build(plain,slug),member=basic.files['members/'+slug+'.json'];
 member.github=login.toLowerCase();
 const errors=[...basic.errors,...checkMember(member).filter(i=>i.fatal).map(i=>i.field+' '+i.kind)];
 if(errors.length)return {ok:false,errors};
 const full=build(post,slug),files=basic.files,warnings=[];
 const roomRel='rooms/'+slug+'/room.json',roomPath=path.join(base,roomRel);
 const room=fs.existsSync(roomPath)?JSON.parse(fs.readFileSync(roomPath,'utf8')):files[roomRel];
 if(parsed.fields.missing)room.missing=parsed.fields.missing;
 for(const n of [1,2]) {
  const id='item-'+n,rel='materials/'+slug+'/'+id,svg=parsed.fields['material_svg_'+n];if(!svg)continue;
  const meta=full.files[rel+'.json'];
  const problems=[...(full.materialErrors[id]||[]),...full.errors.filter(e=>e.includes('material_')&&(e.endsWith('_'+n)||e.endsWith('material_'+n+'_title'))),...materialSvgIssues(svg)];
  if(meta)problems.push(...checkMember({...member,intro:meta.source+' '+meta.title}).filter(i=>i.fatal).map(i=>i.kind));
  let slot=room.slots.findIndex(s=>s.type==='own'&&s.material===slug+'/'+id);
  if(slot<0)slot=room.slots.findIndex(s=>s.type==='empty');
  if(slot<0)problems.push('房間沒有空格');
  if(problems.length){warnings.push(...problems.map(e=>'素材'+n+'：'+e));continue;}
  files[rel+'.svg']=full.files[rel+'.svg'];files[rel+'.json']=meta;
  room.slots[slot]={type:'own',material:slug+'/'+id};
 }
 files[roomRel]=room;
 for(const [rel,value] of Object.entries(files)){const dest=path.join(base,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}
 return {ok:true,slug,branch:'intake/'+slug,warnings,kinds:[...new Set(checkMember(member).map(i=>i.kind))],files:Object.keys(files)};
}
if(require.main===module){const result=intakeEvent(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]?path.resolve(process.argv[3]):undefined);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;}
module.exports={intakeEvent};
