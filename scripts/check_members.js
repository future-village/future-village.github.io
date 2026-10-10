'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const patterns = [
 ['台灣手機', /(?:\+886[- ]?9\d{2}|09\d{2})[- ]?\d{3}[- ]?\d{3}/, true],
 ['台灣市話', /0[2-8][- ]?\d{3,4}[- ]?\d{4}/, true],
 ['Email', /(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, true],
 ['身分證格式', /\b[A-Z][12]\d{8}\b/i, true],
 ['統一編號', /(?<!\d)\d{8}(?!\d)/],
 ['地址樣式', /[\u4e00-\u9fff]{1,8}[市縣].{0,12}[區鄉鎮].{0,20}[路街].{0,12}號/, true],
 ['IPv4', /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/],
 ['本機路徑', /(?<![A-Za-z])[A-Za-z]:[\\/]|\/(?:Users|home)\//i, true],
 ['金鑰', /(?:sk-(?:proj-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20,}|xox[abpors]-[A-Za-z0-9-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/, true],
 ['LINE 連結', /(?:line\.me|lin\.ee|line\.naver\.jp)(?![\w-])/i, true]
];
const {imageIssue,imageSize}=require('./export_public');
const HOUSE_BYTES=400*1024;
const HOUSE_EDGE=1024;
const SLOTS = 6;
const MISSING_MAX = 60;
const LETTER_MAX = 200;
const FOOTPRINT_MAX = 40;
const LETTER_KEYS = ['from','to','date','body','ai_written'];
const SWAP_KEYS = ['a','b','a_material','b_material','a_ok','b_ok','completed_on','drafted_by','proposed_on'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXTERNAL_LINK = /https?:\/\/|\bwww\./i;
const SLUG = /^(?!(?:con|aux|nul|prn|com[1-9]|lpt[1-9])$)[a-z0-9][a-z0-9-]{0,40}$/;
const FORBIDDEN_KEY = /price|pricing|cost|rarity|rare|currency|coin|價|稀有|幣/i;
const SVG_TAGS = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','title','desc']);
const EXECUTABLE=new RegExp('`'.repeat(3)+'|~~~|<script\\b|<%|<\\?php|javascript:|data:\\s*text\\/html|\\bon[a-z]+\\s*=','i');
function validDate(value){
 return DATE.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
// 可執行內容只認標記，不認散文裡的程式單字。
// 命中就失敗：三個反引號、~~~、<script、<%、<?php、javascript:、data:text/html、on*=。
// function、import、require 不算。標記寫在警告句裡也算。on*= 與素材 SVG 同一條，onion= 這種也會中，這條不放寬。
function executableMark(text){return EXECUTABLE.test(text);}
function checkBook(book,file='book',today=taipeiToday()) {
 const issues=[],add=(field,kind)=>issues.push({file,field,kind,fatal:true,advice:'請修正書卡'});
 if(!book||typeof book!=='object'||Array.isArray(book)){add('','JSON 必須是物件');return issues;}
 for(const key of ['title','summary','source_url','added_by','made_by','license','version'])if(typeof book[key]!=='string'||!book[key].trim())add(key,'缺少必填');
 try{const u=new URL(book.source_url);if(u.protocol!=='https:'||!u.hostname||u.username||u.password)throw new Error();}catch{add('source_url','須為 https URL');}
 if(!Array.isArray(book.tags)||!book.tags.every(t=>typeof t==='string'&&t.trim()))add('tags','須為文字陣列');
 if(!['human','ai_marked'].includes(book.made_by))add('made_by','須為 human 或 ai_marked');
 if(book.do_not_execute!==true)add('do_not_execute','須為 true');
 if(!validDate(book.verified_on))add('verified_on','須為有效 YYYY-MM-DD');
 else if(book.verified_on>today)add('verified_on','不能晚於今天（'+today+'）');
 scanText(book,'',add);
 if(executableMark(JSON.stringify(book)))add('content','不收可執行內容');
 return issues;
}
function checkLibrary(base,issues,today,books){
 const rootDir=path.join(base,'library');
 if(!fs.existsSync(rootDir))return;
 const fail=(rel,kind)=>issues.push({file:rel,field:'',kind,fatal:true,advice:'書架只收 README.md 與 library/<id>.json'});
 function walk(abs,rel){
  let entries;try{entries=fs.readdirSync(abs,{withFileTypes:true});}catch{fail(rel,'書架目錄無法讀取');return;}
  for(const ent of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   const childRel=rel+'/'+ent.name,childAbs=path.join(abs,ent.name);
   let lst;try{lst=fs.lstatSync(childAbs);}catch{fail(childRel,'書架必須是普通檔');continue;}
   if(lst.isSymbolicLink()){fail(childRel,'書架必須是普通檔');continue;}
   if(lst.isDirectory()){fail(childRel,'書架只收純文字 JSON');walk(childAbs,childRel);continue;}
   if(!lst.isFile()){fail(childRel,'書架必須是普通檔');continue;}
   if(childRel==='library/README.md')continue;
   const id=ent.name.endsWith('.json')?ent.name.slice(0,-5):'';
   if(rel!=='library'||!SLUG.test(id)){fail(childRel,'書架只收純文字 JSON');continue;}
   try{const book=readJson(childAbs);issues.push(...checkBook(book,childRel,today));books.set(id,book);}catch{issues.push({file:childRel,field:'',kind:'JSON 無法解析',fatal:true,advice:'請修正書卡'});}
  }
 }
 walk(rootDir,'library');
}
function checkPublicProps(base,issues){
 const dir=path.join(base,'site','world','assets','models');
 if(!fs.existsSync(dir))return;
 const fail=(field,kind)=>issues.push({file:'site/world/assets/models',field,kind,fatal:true,advice:'公共道具只收 CC0，並在 ART_CREDITS.md 同一行寫檔名、CC0、https 來源與 LICENSE*.txt'});
 if(fs.lstatSync(dir).isSymbolicLink()){fail('','模型目錄必須是普通目錄');return;}
 const found=[];
 function walk(abs,rel,top){
  let entries;try{entries=fs.readdirSync(abs,{withFileTypes:true});}catch{fail('','模型目錄無法讀取');return;}
  for(const ent of entries){
   const childAbs=path.join(abs,ent.name),childRel=rel+'/'+ent.name;
   let lst;try{lst=fs.lstatSync(childAbs);}catch{continue;}
   if(lst.isSymbolicLink()){if(ent.name.toLowerCase().endsWith('.glb'))fail(ent.name,'模型必須是普通檔');continue;}
   if(lst.isDirectory()){walk(childAbs,childRel,false);continue;}
   if(!lst.isFile()||!ent.name.toLowerCase().endsWith('.glb'))continue;
   if(!ent.name.endsWith('.glb')){fail(ent.name,'模型副檔名只收小寫 .glb');continue;}
   if(!top){fail(ent.name,'模型只放 models 目錄直屬');continue;}
   found.push(ent.name);
  }
 }
 walk(dir,'site/world/assets/models',true);
 if(!found.length)return;
 let text;try{text=fs.readFileSync(path.join(base,'ART_CREDITS.md'),'utf8');}catch{fail('ART_CREDITS.md','缺少根目錄 ART_CREDITS.md');return;}
 const lines=text.split(/\r?\n/);
 const cc0=/(^|[^A-Za-z0-9])CC0([^A-Za-z0-9]|$)/;
 const nonCc0=/CC[\s-]*BY|\bMIT\b|\bApache\b|\bGPL\b|All Rights Reserved|©/i;
 const hasFile=(line,name)=>new RegExp('(^|[^A-Za-z0-9._-])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^A-Za-z0-9._-]|$)').test(line);
 for(const name of found.sort()){
  const hits=lines.filter(line=>hasFile(line,name));
  if(hits.length!==1){fail(name,hits.length?'ART_CREDITS.md 只能有一行寫這個檔名':'ART_CREDITS.md 缺這個檔名');continue;}
  const line=hits[0];
  const mentions=line.match(/[A-Za-z0-9._-]+\.glb/g)||[];
  if(mentions.length!==1||mentions[0]!==name){fail(name,'一行只寫一個道具檔名');continue;}
  if(!cc0.test(line)){fail(name,'同一行要有 CC0');continue;}
  if(nonCc0.test(line)){fail(name,'同一行出現非 CC0 授權');continue;}
  if(!/https:\/\//.test(line)){fail(name,'同一行要有 https 來源');continue;}
  const lics=line.match(/LICENSE[A-Za-z0-9._-]*\.txt/g)||[];
  if(lics.length!==1){fail(name,'同一行要寫一個授權檔名 LICENSE*.txt');continue;}
  const licPath=path.join(dir,lics[0]);
  let st;try{st=fs.lstatSync(licPath);}catch{fail(name,'授權檔不在模型目錄');continue;}
  if(st.isSymbolicLink()||!st.isFile()){fail(name,'授權檔必須是普通檔');continue;}
  let body;try{body=fs.readFileSync(licPath,'utf8');}catch{fail(name,'授權檔無法讀取');continue;}
  if(!cc0.test(body)||nonCc0.test(body)){fail(name,'授權檔不是 CC0');continue;}
  scanText(line,name,(field,kind,fatal=true)=>issues.push({file:'ART_CREDITS.md',field,kind,fatal:Boolean(fatal),advice:fatal?'請移除或改用去敏描述':'已標示，仍請確認'}));
 }
}

function checkMember(m, file = 'member') {
 const issues = [];
 const add = (field, kind, fatal = true, advice = '請移除或改用去敏描述') => issues.push({file, field, kind, fatal, advice});
 const text = v => typeof v === 'string' && v.trim().length > 0;
 for (const key of ['handle','intro']) if (!text(m[key])) add(key,'缺少必填');
 if (typeof m.handle==='string' && (![...m.handle.trim()].length || [...m.handle.trim()].length>40)) add('handle','須為 1～40 個字元');
 if(m.demo!==undefined && typeof m.demo!=='boolean')add('demo','須為 boolean');
 if(m.demo===true && !text(m.authorized_by))add('authorized_by','示範戶缺少授權人');
 if(m.demo!==true && m.authorized_by!==undefined)add('authorized_by','授權人只給示範戶填');
 if (!['person','company'].includes(m.type)) add('type','須為 person 或 company');
 if (!Number.isInteger(m.avatar) || m.avatar < 1 || m.avatar > 12) add('avatar','須為 1～12');
 if (m.owner_consent !== true) {
   if (m.draft === true)
     add('owner_consent','草稿尚未獲主人同意',false,'主人確認後才可公開');
   else add('owner_consent','缺少主人同意');
 }
 if (m.github !== undefined && !/^[a-z0-9_-]{1,60}$/i.test(m.github)) add('github','須為 GitHub 帳號');
 if(m.github_id!==undefined&&(!Number.isSafeInteger(m.github_id)||m.github_id<=0))add('github_id','須為正整數 GitHub 帳號 ID');
 if (m.showcase !== undefined && typeof m.showcase !== 'boolean') add('showcase','須為 true 或 false');
 if (m.gates_pass !== undefined && !(Array.isArray(m.gates_pass) && m.gates_pass.every(g => Number.isInteger(g) && g >= 1 && g <= 8) && new Set(m.gates_pass).size === m.gates_pass.length))
   add('gates_pass','須為 1～8 不重複的關號；只記錄、不加格');
 if(m.recommends!==undefined && !(Array.isArray(m.recommends)&&m.recommends.every(id=>typeof id==='string'&&SLUG.test(id)))) add('recommends','須為書 id 陣列');
 forbiddenKeys(m, '', add);
 if (m.type === 'company') {
   if (!m.company || !text(m.company.what)) add('company.what','公司必填：我們做什麼');
   const works = m.company?.works ?? [];
   if (!Array.isArray(works) || works.length > 3) add('company.works','作品須為陣列且最多 3 件');
   else works.forEach((w,i) => {
     if (!w || !text(w.title) || !text(w.description)) add('company.works.'+i,'作品缺少標題或一句話');
     if (w?.image && !safeImage(w.image)) add('company.works.'+i+'.image','僅收 repo 自有安全圖檔路徑');
   });
 }
 if(m.works!==undefined){if(!Array.isArray(m.works)||m.works.length>3)add('works','作品須為陣列且最多 3 件');else for(const w of m.works)if(!w||!text(w.title)||!text(w.description)||Object.keys(w).some(k=>!['title','description'].includes(k)))add('works','作品只收標題與一句話');}
 function visit(value, field, consent = false) {
   if (Array.isArray(value)) return value.forEach((v,i)=>visit(v,field+'.'+i,consent));
   if (value && typeof value === 'object') {
     const approved = field === 'company.card' || field === 'card';
     for (const [k,v] of Object.entries(value)) visit(v,field ? field+'.'+k : k, approved && value.public_ok === true && k === 'contact');
   } else if (typeof value === 'string') {
     if(['card.contact','company.card.contact'].includes(field)&&EXTERNAL_LINK.test(value))add(field,'不收外部連結');
     for (const [kind,re,fatal] of patterns) if (re.test(value)) {
       if (consent && ['台灣手機','台灣市話','Email'].includes(kind)) add(field,kind+'：本人同意公開',false,'已標 public_ok: true；仍請確認公開範圍');
       else add(field,kind,Boolean(fatal));
     }
   }
 }
 visit(m,'');
 if (m.custom_svg !== undefined && m.custom_svg !== '') {
   if (typeof m.custom_svg !== 'string' || !safeSvg(m.custom_svg)) add('custom_svg','SVG 不安全或超過 4KB');
 }
 return issues;
}
function safeSvg(svg) {
 return typeof svg === 'string' && Buffer.byteLength(svg,'utf8') <= 4096 && materialSvgIssues(svg).length === 0;
}
function forbiddenKeys(value, field, add) {
 if (Array.isArray(value)) return value.forEach((v,i)=>forbiddenKeys(v,field+'.'+i,add));
 if (value && typeof value === 'object') for (const [k,v] of Object.entries(value)) {
   const f = field ? field+'.'+k : k;
   if (FORBIDDEN_KEY.test(k)) add(f,'不設價格、稀有度、幣別欄',true,'素材交換是互相授權，不標價');
   forbiddenKeys(v,f,add);
 }
}
function scanText(value, field, add) {
 if (Array.isArray(value)) return value.forEach((v,i)=>scanText(v,field+'.'+i,add));
 if (value && typeof value === 'object') return Object.entries(value).forEach(([k,v])=>scanText(v,field ? field+'.'+k : k,add));
 if (typeof value === 'string') for (const [kind,re,fatal] of patterns) if (re.test(value)) add(field,kind,Boolean(fatal));
}
// 素材 SVG：只收白名單元素，擋程式、事件、外連與 use。
function materialSvgIssues(svg) {
 const out = [];
 if (Buffer.byteLength(svg,'utf8') > 16384) out.push('超過 16KB');
 if (!/^\s*<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) out.push('須以 <svg> 開頭結尾');
 if (/<[!?]/.test(svg)) out.push('不收 DOCTYPE、ENTITY 或處理指令');
 for (const [, tag] of svg.matchAll(/<\s*\/?\s*([A-Za-z][\w:.-]*)/g)) if (!SVG_TAGS.has(tag)) out.push('不允許的元素 <'+tag+'>');
 if (/[&\\]/.test(svg)) out.push('不收實體編碼或跳脫字元');
 if (/\bstyle\s*=|\\/i.test(svg)) out.push('style 屬性或 CSS 跳脫');
 if (/\bon[a-z]+\s*=/i.test(svg)) out.push('事件屬性 on*');
 if (/(?:https?:|javascript:|data:|\/\/)[^"'\s>]*/i.test(svg.replace(/xmlns(?::\w+)?\s*=\s*(["'])http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink)\1/g,''))) out.push('外站連結');
 if (/\b(?:xlink:)?href\s*=|@import|url\s*\(/i.test(svg)) out.push('href 或外部參照');
 return [...new Set(out)];
}
function readJson(file) { return JSON.parse(fs.readFileSync(file,'utf8')); }
function listJson(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort() : []; }
function listDirs(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort() : []; }
// 整個 repo：成員、房間、素材、互換，以及 N 的數法。
function pngAnimated(buf){
 let offset=8;
 while(offset+12<=buf.length){
  const size=buf.readUInt32BE(offset),type=buf.toString('ascii',offset+4,offset+8);
  if(type==='acTL'||type==='fcTL'||type==='fdAT')return true;
  if(size>buf.length-offset-12)return false;
  offset+=size+12;
  if(type==='IEND')break;
 }
 return false;
}
function checkHouses(base,issues,issue){
 const houses=new Map();
 const roomRoot=path.join(base,'rooms');
 if(!fs.existsSync(roomRoot))return houses;
 for(const slug of listDirs(roomRoot)){
  const dir=path.join(roomRoot,slug),before=issues.length,add=issue('rooms/'+slug);
  let names;
  try{names=fs.readdirSync(dir,{withFileTypes:true});}
  catch{add('house','房間目錄讀不到',true,'請改成普通資料夾');continue;}
  const houseNames=names.filter(e=>/^house\./i.test(e.name));
  if(!houseNames.length)continue;
  if(!SLUG.test(slug))add('house','房子圖目錄須為住戶 slug');
  if(houseNames.some(e=>!['house.png','house.webp','house.json'].includes(e.name)))add('house','房子圖只收 PNG 或 WebP');
  const hasPng=houseNames.some(e=>e.name==='house.png'),hasWebp=houseNames.some(e=>e.name==='house.webp'),hasMeta=houseNames.some(e=>e.name==='house.json');
  if(hasPng&&hasWebp)add('house','房子圖只留 PNG 或 WebP 一種');
  if(!hasPng&&!hasWebp)add('house','缺少房子圖');
  if(!hasMeta)add('house','缺少 house.json');
  const imageName=hasPng&&!hasWebp?'house.png':hasWebp&&!hasPng?'house.webp':null;
  const fileStat=name=>{
   const full=path.join(dir,name);
   let st;try{st=fs.lstatSync(full);}catch{add('house','房子圖必須是普通檔');return null;}
   if(st.isSymbolicLink()||!st.isFile()){add('house','房子圖必須是普通檔');return null;}
   return {full,st};
  };
  if(imageName){
   const image=fileStat(imageName);
   if(image&&image.st.size>HOUSE_BYTES)add('house','房子圖超過 400KB');
   else if(image){
    const buf=fs.readFileSync(image.full),ext=imageName.endsWith('.webp')?'.webp':'.png',img=imageIssue(buf,ext);
    if(img)add('house','房子圖未過影像檢查：'+img);
    else if(ext==='.png'&&pngAnimated(buf))add('house','房子圖必須是靜態圖');
    else{
     const size=imageSize(buf,ext);
     if(!size||size.width<1||size.height<1||size.width>HOUSE_EDGE||size.height>HOUSE_EDGE)add('house','房子圖尺寸須為 1～1024');
    }
   }
  }
  if(hasMeta){
   const metaFile=fileStat('house.json');
   if(metaFile){
    let meta;try{meta=readJson(metaFile.full);}catch{add('house.json','JSON 無法解析');meta=null;}
    if(meta&&(typeof meta!=='object'||Array.isArray(meta))){add('house.json','JSON 必須是物件');meta=null;}
    if(meta){
     const madd=issue('rooms/'+slug+'/house.json');
     for(const key of Object.keys(meta))if(!['source','rights_ok','desensitized_ok','made_by'].includes(key))madd(key,'house.json 只收 source、rights_ok、desensitized_ok、made_by');
     if(!(typeof meta.source==='string'&&meta.source.trim()))madd('source','缺少出處');
     if(typeof meta.source==='string'&&EXTERNAL_LINK.test(meta.source))madd('source','不收外部連結');
     if(meta.rights_ok!==true)madd('rights_ok','缺少本人的權利勾');
     if(meta.desensitized_ok!==true)madd('desensitized_ok','缺少去敏勾');
     if(!['human','ai_marked','ai_assisted'].includes(meta.made_by))madd('made_by','須為 human、ai_marked 或 ai_assisted');
     forbiddenKeys(meta,'',madd);scanText(meta,'',madd);
    }
   }
  }
  if(imageName&&SLUG.test(slug)&&!issues.slice(before).some(i=>i.fatal))houses.set(slug,'rooms/'+slug+'/'+imageName);
 }
 return houses;
}

function checkRepo(base = root, {today = taipeiToday()} = {}) {
 const issues = [];
 const issue = file => (field, kind, fatal = true, advice = '請修正') => issues.push({file, field, kind, fatal, advice});
 const members = new Map();
 const memberDir = path.join(base,'members');
 const memberFiles = listJson(memberDir);
 if (!memberFiles.length) issue('members')('', '沒有成員檔');
 for (const file of memberFiles) {
   let m;
   try { m = readJson(path.join(memberDir,file)); } catch { issue('members/'+file)('','JSON 無法解析'); continue; }
   issues.push(...checkMember(m,'members/'+file));
   if (!SLUG.test(m.id || '') || m.id+'.json' !== file) issue('members/'+file)('id','id 須為小寫 slug 且與檔名相同');
   else members.set(m.id,m);
 }
 // 素材
 const materials = new Map();
 for (const slug of listDirs(path.join(base,'materials'))) {
   const dir = path.join(base,'materials',slug);
   if (!members.has(slug)) issue('materials/'+slug)('','沒有對應的成員');
   for (const name of fs.readdirSync(dir).sort()) {
     const rel = 'materials/'+slug+'/'+name, add = issue(rel);
     if (name.endsWith('.json')) continue;
     if (!name.endsWith('.svg')) { add('','素材第一版只收 SVG'); continue; }
     const id = name.slice(0,-4), metaFile = path.join(dir,id+'.json');
     if (!SLUG.test(id)) add('','素材檔名須為小寫 slug');
     const svg = fs.readFileSync(path.join(dir,name),'utf8');
     for (const why of materialSvgIssues(svg)) add('svg','SVG 不安全：'+why,true,'只留基本圖形與文字');
     scanText(svg.replace(/<[^>]*>/g,' '),'svg 文字',add);
     if (!fs.existsSync(metaFile)) { add('','缺少同名 .json（出處與權利勾）'); continue; }
     let meta;
     try { meta = readJson(metaFile); } catch { add('json','JSON 無法解析'); continue; }
     const madd = issue(rel.replace(/\.svg$/,'.json'));
     for (const key of ['title','source']) if (!(typeof meta[key] === 'string' && meta[key].trim())) madd(key, key === 'source' ? '缺少出處' : '缺少標題');
     if (meta.rights_ok !== true) madd('rights_ok','缺少本人的權利勾');
     if (meta.desensitized_ok !== true) madd('desensitized_ok','缺少去敏勾');
     if (!['human','ai_marked','ai_assisted'].includes(meta.made_by)) madd('made_by','須為 human、ai_marked 或 ai_assisted');
     forbiddenKeys(meta,'',madd); scanText(meta,'',madd);
     materials.set(slug+'/'+id, {...meta, owner: slug, id});
   }
   for (const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json')))
     if (!fs.existsSync(path.join(dir,name.slice(0,-5)+'.svg'))) issue('materials/'+slug+'/'+name)('','沒有同名 SVG');
 }
 const goodMaterial = ref => materials.has(ref) && !issues.some(i => i.fatal && (i.file === 'materials/'+ref+'.svg' || i.file === 'materials/'+ref+'.json'));
 // 互換：兩邊都同意、兩件素材都過檢查才算完成
 const swaps = new Map();
 for (const file of listJson(path.join(base,'swaps'))) {
   const add = issue('swaps/'+file);
   let s;
   try { s = readJson(path.join(base,'swaps',file)); } catch { add('','JSON 無法解析'); continue; }
   forbiddenKeys(s,'',add); scanText(s,'',add);
   for (const k of Object.keys(s)) if (!SWAP_KEYS.includes(k) && !FORBIDDEN_KEY.test(k)) add(k,'互換檔只收 '+SWAP_KEYS.join('、'));
   if (s.completed_on !== undefined && (!DATE.test(s.completed_on) || !Number.isFinite(Date.parse(s.completed_on)) || new Date(s.completed_on).toISOString().slice(0,10)!==s.completed_on)) add('completed_on','須為有效 YYYY-MM-DD');
   if (s.drafted_by !== undefined && s.drafted_by !== 'ai') add('drafted_by','須為 ai');
   if (!(s.a < s.b) || file !== s.a+'__'+s.b+'.json') { add('a/b','檔名須為 <a>__<b>.json，a 依字母排在 b 前'); continue; }
   for (const side of ['a','b']) {
     if (!members.has(s[side])) add(side,'沒有對應的成員');
     if (typeof s[side+'_material'] !== 'string' || !s[side+'_material'].startsWith(s[side]+'/')) add(side+'_material','須是 '+side+' 自己目錄裡的素材');
     else if (!goodMaterial(s[side+'_material'])) add(side+'_material','素材不存在或沒過檢查（出處、權利勾、去敏勾、SVG）');
   }
   if (s.a_ok !== true || s.b_ok !== true) add('a_ok/b_ok','只有一邊同意：這筆還是「已提出」，兩邊都勾了才合併',true,'等雙方本人在同一個 PR 只改自己那一側的 *_ok');
   swaps.set(s.a+'__'+s.b, s);
 }
  const proposalDay = new Map();
 for (const key of [...swaps.keys()].sort()) {
   const s = swaps.get(key), add = issue('swaps/'+key+'.json');
   const open = s.a_ok !== true || s.b_ok !== true;
   if (s.proposed_on !== undefined && !civilDay(s.proposed_on)) { add('proposed_on','須為有效 YYYY-MM-DD'); continue; }
   if (open && s.proposed_on === undefined) { add('proposed_on','提案要標台灣日曆日 proposed_on'); continue; }
   if (s.proposed_on !== undefined && s.proposed_on > today) { add('proposed_on','提案日不能晚於今天（'+today+'）。下一個台灣日曆日是 '+nextTaipeiDay(today)+'，請那天再寫新檔。機器不改日期。'); continue; }
   if (s.proposed_on === undefined) continue;
   for (const slug of [s.a, s.b]) {
     const slot = slug+' '+s.proposed_on, prior = proposalDay.get(slot);
     if (prior) add('proposed_on','同一戶同一天只能新提一筆互換（已有：'+prior+'）',true,'請改用下一個台灣日曆日 '+nextTaipeiDay(s.proposed_on)+'。機器不改日期、不代寄、不代勾。');
     else proposalDay.set(slot, 'swaps/'+key+'.json');
   }
 }
 const completeSwap = key => swaps.has(key) && !issues.some(i => i.fatal && i.file === 'swaps/'+key+'.json');
 // 房間：每人一間、固定 6 格
 const rooms = new Map();
 const roomDirs = listDirs(path.join(base,'rooms'));
 for (const slug of roomDirs) {
   const rel = 'rooms/'+slug+'/room.json', add = issue(rel);
   if (!members.has(slug)) add('','沒有對應的成員');
   let r;
   try { r = readJson(path.join(base,rel)); } catch { add('','缺少或無法解析 room.json'); continue; }
   forbiddenKeys(r,'',add); scanText(r,'',add);
   if (r.owner !== slug) add('owner','須與目錄名相同');
   for (const k of Object.keys(r)) if (!['owner','slots','missing'].includes(k) && !FORBIDDEN_KEY.test(k)) add(k,'room.json 只收 owner、slots、missing');
   // 缺格句子：這間房還缺什麼素材，一句話，選填
   if (r.missing !== undefined && !(typeof r.missing === 'string' && r.missing.length <= MISSING_MAX)) add('missing','缺格句子須為 '+MISSING_MAX+' 字以內的一句話');
   if (!Array.isArray(r.slots) || r.slots.length !== SLOTS) { add('slots','測試期每間房固定 '+SLOTS+' 格'); continue; }
   r.slots.forEach((slot,i) => {
     const f = 'slots.'+i;
     if (!slot || slot.type === 'empty') return;
     if (slot.type === 'own') {
       if (typeof slot.material !== 'string' || !slot.material.startsWith(slug+'/')) add(f,'自己的格子只能放自己目錄的素材');
       else if (!goodMaterial(slot.material)) add(f,'素材不存在或沒過檢查');
     } else if (slot.type === 'swap') {
       const s = swaps.get(slot.swap);
       if (!s || (s.a !== slug && s.b !== slug)) return add(f,'找不到這筆互換，或房主不是其中一方');
       const other = s.a === slug ? 'b' : 'a';
       if (slot.material !== s[other+'_material']) add(f,'只能掛對方在這筆互換裡授權的那一件');
       if (!completeSwap(slot.swap)) add(f,'互換還沒完成，不能掛上');
     } else add(f,'type 須為 empty、own 或 swap');
   });
   rooms.set(slug,r);
 }
 for (const slug of members.keys()) if (!roomDirs.includes(slug)) issue('rooms/'+slug)('','每個成員要有一間 room.json');
 const houses=checkHouses(base,issues,issue);
 // 每日一封信：一個人一個日曆日只寄一封；待送的隔一個日曆日以後才移到已送；沒有轉寄欄
 const letters = {pending: [], delivered: []}, sentOn = new Map();
 for (const box of ['pending','delivered']) for (const file of listJson(path.join(base,'letters',box))) {
   const rel = 'letters/'+box+'/'+file, add = issue(rel);
   let l;
   try { l = readJson(path.join(base,'letters',box,file)); } catch { add('','JSON 無法解析'); continue; }
   forbiddenKeys(l,'',add); scanText(l,'',add);
   const allowed = box === 'delivered' ? LETTER_KEYS.concat('delivered_on') : LETTER_KEYS;
   for (const k of Object.keys(l)) if (!allowed.includes(k) && !FORBIDDEN_KEY.test(k)) add(k,'信只收 '+allowed.join('、')+'；沒有轉寄欄');
   if (!members.has(l.from) || !members.has(l.to) || l.from === l.to) add('from/to','寄件人與收件人須是兩個不同的成員');
   if (!DATE.test(l.date || '')) { add('date','日期須為 YYYY-MM-DD'); continue; }
   if (file !== l.from+'__'+l.to+'__'+l.date+'.json') add('','檔名須為 <from>__<to>__<date>.json');
   if (!(typeof l.body === 'string' && l.body.trim() && l.body.length <= LETTER_MAX)) add('body','信的內容須為 1～'+LETTER_MAX+' 字');
   if (typeof l.body === 'string' && EXTERNAL_LINK.test(l.body)) add('body','信裡不放外部連結');
   if (typeof l.ai_written !== 'boolean') add('ai_written','須為 true 或 false');
   if (box === 'pending') {
     if (l.date > today) add('date','寄出日不能晚於今天（'+today+'）');
     else if (l.date < today) add('date','已過寄出日，該跑 deliver_letters.js 送出',false,'node scripts/deliver_letters.js');
   } else if (!DATE.test(l.delivered_on || '') || !(l.delivered_on > l.date)) add('delivered_on','送達日須晚於寄出日（隔一個日曆日以後）');
   const key = l.from+' '+l.date;
   if (sentOn.has(key)) add('date','同一個人同一天只能寄一封（另一封：'+sentOn.get(key)+'）', true, '超過的請改用下一個台灣日曆日 '+nextTaipeiDay(l.date)+' 另寫一封。機器不改日期、不代寄。');
   else sentOn.set(key, rel);
   letters[box].push(l);
 }
 // 足跡：footprints/<訪客>.jsonl，一行一次拜訪
 const footprints = [];
 const fpDir = path.join(base,'footprints');
 if (fs.existsSync(fpDir)) for (const file of fs.readdirSync(fpDir).sort()) {
   const rel = 'footprints/'+file, add = issue(rel), visitor = file.replace(/\.jsonl$/,'');
   if (!file.endsWith('.jsonl') || !members.has(visitor)) { add('','檔名須為 <成員代號>.jsonl'); continue; }
   fs.readFileSync(path.join(fpDir,file),'utf8').split('\n').forEach((text,i) => {
     if (!text.trim()) return;
     const f = 'line '+(i+1);
     let line;
     try { line = JSON.parse(text); } catch { return add(f,'這一行不是 JSON'); }
     forbiddenKeys(line,f,add); scanText(line,f,add);
     for (const k of Object.keys(line)) if (!['room','date','note'].includes(k) && !FORBIDDEN_KEY.test(k)) add(f+'.'+k,'足跡只收 room、date、note');
     if (!members.has(line.room) || line.room === visitor) add(f,'room 須是別人的房間');
     if (!DATE.test(line.date || '') || line.date > today) add(f,'日期須為 YYYY-MM-DD 且不晚於今天');
     if (line.note !== undefined && !(typeof line.note === 'string' && line.note.length <= FOOTPRINT_MAX)) add(f,'note 須為 '+FOOTPRINT_MAX+' 字以內');
     if (typeof line.note === 'string' && EXTERNAL_LINK.test(line.note)) add(f,'足跡不放外部連結');
     footprints.push({visitor, ...line});
   });
 }
 const books=new Map();
 checkLibrary(base,issues,today,books);
 checkPublicProps(base,issues);
 for(const m of members.values())for(const id of m.recommends||[])if(!books.has(id))issue('members/'+m.id+'.json')('recommends','書 id 不存在');
 // 公共目錄：由腳本從已過檢查的素材彙總，人不要手改
 const catalog = buildCatalog(materials, members, goodMaterial);
 // N：主人同意、不是展示櫃、不是範例、不是草稿
 const n = [...members.values()].filter(m => m.owner_consent === true && m.showcase !== true && m.example !== true && m.demo !== true && m.draft !== true).length;
 return {files: memberFiles.length, issues, n, members, materials, swaps, rooms, letters, footprints, catalog, houses};
}
function buildCatalog(materials, members, ok) {
 return [...materials.keys()].filter(ok).sort().map(ref => {
   const m = materials.get(ref);
   return {ref, title: m.title, owner: m.owner, handle: members.get(m.owner)?.handle || m.owner, source: m.source, made_by: m.made_by};
 });
}
function civilDay(value) {
 return typeof value === 'string' && DATE.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function nextTaipeiDay(day) {
 if (!civilDay(day)) return null;
 const [y, m, d] = day.split('-').map(Number);
 return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function taipeiToday(now = new Date()) {
 return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
}
function safeImage(s) {
 return typeof s === 'string' && /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(s) && !s.includes('..') && fs.existsSync(path.join(root,s));
}
function checkDirectory(directory) {
 const issues=[];
 const files=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).sort();
 if (!files.length) issues.push({file:directory,field:'',kind:'沒有成員檔',fatal:true,advice:'請提供成員 JSON'});
 for (const file of files) {
   try { issues.push(...checkMember(JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')),file)); }
   catch { issues.push({file,field:'',kind:'JSON 無法解析',fatal:true,advice:'請修正 JSON'}); }
 }
 return {files:files.length,issues};
}
if (require.main === module) {
 try {
   // 不帶參數或指向含 members/ 的目錄：整個 repo 檢查；指向只有成員檔的目錄：只查成員。
   const args=process.argv.slice(2),ti=args.indexOf('--today'),today=ti>=0?args[ti+1]:undefined;
   const arg=args.find((a,i)=>!a.startsWith('--')&&args[i-1]!=='--today');
   const target=arg ? path.resolve(arg) : root;
   const whole=fs.existsSync(path.join(target,'members'));
   const result=whole ? checkRepo(target, today ? {today} : undefined) : checkDirectory(target);
   for (const i of result.issues) console.log((i.fatal?'失敗':'提醒')+'｜'+i.file+'｜'+i.field+'｜'+i.kind+'｜'+i.advice);
   const failed=result.issues.filter(i=>i.fatal).length;
   console.log('檢查 '+result.files+' 個成員檔；失敗 '+failed+'；提醒 '+(result.issues.length-failed));
   if (whole) console.log('房間 '+result.rooms.size+'；素材 '+result.materials.size+'；互換 '+result.swaps.size+'；信 待送 '+result.letters.pending.length+'／已送 '+result.letters.delivered.length+'；足跡 '+result.footprints.length+'；N（展示櫃、範例、草稿不算）= '+result.n);
   process.exitCode=failed?1:0;
 } catch(e) { console.error('檢查失敗：'+e.message);process.exitCode=1; }
}
module.exports={checkBook,checkMember,checkDirectory,checkRepo,materialSvgIssues,safeSvg,taipeiToday,nextTaipeiDay,SLOTS,MISSING_MAX,LETTER_MAX,SLUG,HOUSE_BYTES,HOUSE_EDGE};
