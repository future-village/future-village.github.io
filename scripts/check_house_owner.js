'use strict';
const fs=require('node:fs'),path=require('node:path');
const {SLUG}=require('./check_members');
// Single maintainer login from CONTRIBUTING.md. This file is not CODEOWNERS.
const MAINTAINERS=new Set(['zaxardery8011-design']);
const HOUSE_TOUCHED=/^rooms\/([^/]+)\/house\.(png|webp|json)$/;
function loginSlug(login){return String(login||'').toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,39);}
function norm(rel){return String(rel||'').trim().replace(/\\/g,'/').replace(/^\.\//,'');}
function listedFiles(entries){
 const out=[];
 for(const entry of entries){
  if(typeof entry==='string'){const rel=norm(entry);if(rel)out.push(rel);continue;}
  if(!entry||typeof entry!=='object')continue;
  for(const key of ['filename','previous_filename']){const rel=norm(entry[key]);if(rel)out.push(rel);}
 }
 return out;
}
function checkHouseOwner({author,files,members}){
 const issues=[],login=String(author||'');
 if(MAINTAINERS.has(login.toLowerCase()))return issues;
 const slug=loginSlug(login);
 for(const rel of listedFiles(files)){
  const hit=HOUSE_TOUCHED.exec(rel);if(!hit)continue;
  const room=hit[1],member=members.get(room);
  const github=member&&typeof member.github==='string'?member.github.toLowerCase():'';
  const owns=SLUG.test(slug)&&room===slug&&github===login.toLowerCase();
  if(!owns)issues.push({file:rel,field:'house',kind:'只能改自己那戶的房子圖',fatal:true,advice:'這張圖要由該戶的 GitHub 帳號開 PR；代收 PR 不要附房子圖'});
 }
 return issues;
}
function loadMembers(root){
 const members=new Map(),dir=path.join(root,'members');
 if(!fs.existsSync(dir))return members;
 for(const file of fs.readdirSync(dir)){
  if(!file.endsWith('.json'))continue;
  try{const m=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));if(m&&typeof m.id==='string')members.set(m.id,m);}catch{/* JSON 錯誤歸 check_members */}
 }
 return members;
}
async function filesFromEvent(){
 if(process.env.PR_FILES!=null)return process.env.PR_FILES.split(/\r?\n/);
 const repo=process.env.GITHUB_REPOSITORY,number=process.env.PR_NUMBER,token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;
 if(!repo||!number||!token)throw new Error('需要 PR_FILES，或 GITHUB_REPOSITORY、PR_NUMBER、GITHUB_TOKEN');
 const [owner,name]=repo.split('/');
 if(!owner||!name)throw new Error('GITHUB_REPOSITORY 格式須為 owner/name');
 const files=[],seen=new Set();
 for(let page=1;page<=30;page++){
  const res=await fetch('https://api.github.com/repos/'+owner+'/'+name+'/pulls/'+number+'/files?per_page=100&page='+page,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'future-village-house-check','X-GitHub-Api-Version':'2022-11-28'}});
  if(!res.ok)throw new Error('GitHub PR files HTTP '+res.status);
  const batch=await res.json();
  if(!Array.isArray(batch))throw new Error('GitHub PR files 不是清單');
  let fresh=0;
  for(const file of batch){const key=JSON.stringify([file.filename,file.previous_filename||'']);if(seen.has(key))continue;seen.add(key);files.push(file);fresh++;}
  if(!fresh||batch.length<100)break;
  if(page===30)throw new Error('PR 檔案清單超過 3000');
 }
 return files;
}
async function main(){
 const author=process.env.PR_AUTHOR;
 if(!author)throw new Error('缺少 PR_AUTHOR');
 const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
 const issues=checkHouseOwner({author,files:await filesFromEvent(),members:loadMembers(root)});
 for(const i of issues)console.log('失敗｜'+i.file+'｜'+i.field+'｜'+i.kind+'｜'+i.advice);
 console.log('房子圖歸屬檢查；失敗 '+issues.length);
 process.exitCode=issues.length?1:0;
}
if(require.main===module)main().catch(e=>{console.error('檢查失敗：'+e.message);process.exitCode=1;});
module.exports={checkHouseOwner,loginSlug,listedFiles};
