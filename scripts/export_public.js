'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const hidden=m=>m.owner_consent!==true||m.draft===true;
// Generic public rules; optional local policy is excluded from every export.
const rules=[new RegExp('\\[TB'+'D','i'),new RegExp('TB'+'D:','i'),new RegExp('@gm'+'ail\\.com'),new RegExp('INTERNAL'+'_MARK'),new RegExp('(?<![A-Za-z])[A-Za-z]:['+String.fromCharCode(92).repeat(2)+'/]|/(?:Users|home)/','i')];
function localPolicy(root){const file=path.join(root,'.export-denylist.json');if(!fs.existsSync(file))return {rules:[],exclude:[]};const policy=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(policy.rules)||!Array.isArray(policy.exclude))throw new Error('Invalid local export policy');return {rules:policy.rules.map(source=>new RegExp(source)),exclude:policy.exclude};}
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
function imageIssue(buf,ext){
 if(buf.length>400*1024)return 'image exceeds 400KB';
 if(ext==='.webp'){
  if(buf.length<20||buf.toString('ascii',0,4)!=='RIFF'||buf.toString('ascii',8,12)!=='WEBP'||buf.readUInt32LE(4)+8!==buf.length)return 'invalid WebP container';
  let offset=12,hasImage=false;
  while(offset<buf.length){
   if(offset+8>buf.length)return 'truncated WebP chunk';
   const type=buf.toString('ascii',offset,offset+4),size=buf.readUInt32LE(offset+4);
   if(size>buf.length-offset-8)return 'truncated WebP chunk';
   if(['EXIF','XMP ','ICCP'].includes(type))return 'forbidden WebP metadata '+type;
   if(!['VP8 ','VP8L','VP8X','ALPH'].includes(type))return 'unsupported WebP chunk '+type;
   if(type==='VP8X'&&(size!==10||(buf[offset+8]&0x2e)!==0))return 'unsupported WebP flags';
   if(type==='VP8 '||type==='VP8L')hasImage=true;
   offset+=8+size+(size%2);
  }
  return offset===buf.length&&hasImage?null:'invalid WebP end';
 }
 if(ext==='.png'){
  if(!buf.subarray(0,8).equals(PNG_SIGNATURE))return 'invalid PNG signature';
  let offset=8,ended=false;
  while(offset<buf.length){
   if(offset+12>buf.length)return 'truncated PNG chunk';
   const size=buf.readUInt32BE(offset),type=buf.toString('ascii',offset+4,offset+8);
   if(size>buf.length-offset-12)return 'truncated PNG chunk';
   if(['tEXt','iTXt','zTXt','eXIf'].includes(type))return 'forbidden PNG metadata '+type;
   offset+=size+12;
   if(type==='IEND'){if(size!==0||offset!==buf.length)return 'invalid PNG end';ended=true;break;}
  }
  return ended?null:'missing PNG end';
 }
 if(buf.length<3||buf[0]!==255||buf[1]!==216||buf[2]!==255)return 'invalid JPEG signature';
 let offset=2;
 while(offset<buf.length){
  if(buf[offset++]!==255)return 'invalid JPEG marker';
  while(offset<buf.length&&buf[offset]===255)offset++;
  if(offset>=buf.length)return 'truncated JPEG marker';
  const marker=buf[offset++];
  if(marker===0)return 'invalid JPEG marker';
  if(marker===225)return 'forbidden JPEG APP1 metadata';
  if(marker===217)return offset===buf.length?null:'trailing JPEG bytes';
  if(marker===216)return 'unexpected JPEG start';
  if(marker===1||(marker>=208&&marker<=215))continue;
  if(offset+2>buf.length)return 'truncated JPEG segment';
  const size=buf.readUInt16BE(offset);
  if(size<2||size>buf.length-offset)return 'truncated JPEG segment';
  offset+=size;
  if(marker===218){
   // Entropy data permits stuffed FF00 and restart markers, then resumes segments.
   while(offset<buf.length){
    if(buf[offset]!==255){offset++;continue;}
    let next=offset+1;while(next<buf.length&&buf[next]===255)next++;
    if(next>=buf.length)return 'truncated JPEG entropy';
    if(buf[next]===0||(buf[next]>=208&&buf[next]<=215)){offset=next+1;continue;}
    break;
   }
  }
 }
 return 'missing JPEG end';
}
function scan(base,files){
 const hits=[],activeRules=[...rules,...localPolicy(base).rules];let control=0,imageBytes=0;
 for(const rel of files){
  const buf=fs.readFileSync(path.join(base,rel)),ext=path.posix.extname(rel).toLowerCase();
  if((rel.startsWith('site/assets/art/')&&['.png','.jpg','.jpeg'].includes(ext))||(rel.startsWith('site/assets/welcome/')&&['.webp','.jpg'].includes(ext))){
   imageBytes+=buf.length;const issue=imageIssue(buf,ext);if(issue)hits.push(rel+': '+issue);continue;
  }
  if(buf.includes(0)){hits.push(rel+': null byte');continue;}
  const text=buf.toString('utf8');control+=(text.match(/未來村/g)||[]).length;
  text.split(/\r?\n/).forEach((line,i)=>{for(const rule of activeRules)if(rule.test(line))hits.push(rel+':'+(i+1)+' '+rule.source);});
 }
 if(imageBytes>3*1024*1024)hits.push('images exceed 3MB total');
 return {hits,control};
}
function exportPublic(out,root=path.resolve(__dirname,'..')) {
 out=path.resolve(out);if(out===root||out.startsWith(root+path.sep)||fs.existsSync(out))throw new Error('Use a new output directory outside the repository');
 const proc=cp.spawnSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8'});if(proc.status!==0)throw new Error(proc.stderr);
 const excluded=new Set(fs.readdirSync(path.join(root,'members')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(root,'members',f),'utf8'))).filter(hidden).map(m=>m.id));
 const files=proc.stdout.split('\0').filter(Boolean).filter(rel=>{
  if(rel==='.export-denylist.json'||localPolicy(root).exclude.some(item=>rel===item||rel.startsWith(item)))return false;
  if(['catalog.json','site/members.json'].includes(rel))return false;
  if(/^members\/[^/]+\.json$/.test(rel)&&excluded.has(path.basename(rel,'.json')))return false;
  if(/^(rooms|materials)\//.test(rel)&&excluded.has(rel.split('/')[1]))return false;
  if(rel.startsWith('footprints/')&&excluded.has(path.basename(rel,'.jsonl')))return false;
  if(/^(swaps|letters)\//.test(rel)&&rel.endsWith('.json')){const j=JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));if([j.a,j.b,j.from,j.to].some(id=>excluded.has(id)))return false;}
  return true;
 });
 const result=scan(root,files);
 for(const rel of files)if(fs.lstatSync(path.join(root,rel)).isSymbolicLink())result.hits.push(rel+': symbolic link');
 for(const hit of result.hits)console.error(hit);console.log('未來村 control count: '+result.control);
 if(result.hits.length || result.control<1)return {...result,files,out,ok:false};
 fs.mkdirSync(out,{recursive:true});
 for(const rel of files){const src=path.join(root,rel);if(fs.lstatSync(src).isSymbolicLink())throw new Error('Links cannot be exported: '+rel);const dest=path.join(out,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
 return {...result,files,out,ok:!result.hits.length&&result.control>=1};
}
if(require.main===module){try{if(!process.argv[2])throw new Error('Usage: node scripts/export_public.js <outdir>');if(!exportPublic(process.argv[2]).ok)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={exportPublic,scan};
