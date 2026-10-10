'use strict';
const fs=require('node:fs'),path=require('node:path');
const {mkTmp}=require('./_tmp');
// Seeded demonstration records only; new residents never change test expectations.
function seed(dest,source=path.resolve(__dirname,'..')) {
 const dirs=['members','rooms','materials','swaps','letters','footprints'];
 for(const dir of dirs){fs.mkdirSync(path.join(dest,dir),{recursive:true});
  for(const name of fs.readdirSync(path.join(source,dir))){
   if(!/^(?:example-person|example-company|aiwff-main-brain)(?:\.|__|$)/.test(name)&&!(dir==='letters'&&['pending','delivered'].includes(name)))continue;
   const src=path.join(source,dir,name),out=path.join(dest,dir,name);
   // Mail fixtures must not follow the live delivery workflow's daily moves.
   if(dir==='letters')continue;
   else fs.cpSync(src,out,{recursive:true});
  }
 }
 for(const state of ['pending','delivered'])fs.mkdirSync(path.join(dest,'letters',state),{recursive:true});
 const letter={from:'example-person',to:'example-company',date:'2026-10-08',body:'虛構測試信',ai_written:false};
 fs.writeFileSync(path.join(dest,'letters/pending/example-person__example-company__2026-10-08.json'),JSON.stringify(letter));
 fs.writeFileSync(path.join(dest,'letters/delivered/example-company__example-person__2026-10-07.json'),JSON.stringify({...letter,from:'example-company',to:'example-person',date:'2026-10-07',delivered_on:'2026-10-08'}));
 return dest;
}
function fixture(prefix='fixture-'){return seed(mkTmp(prefix));}
function publicTracked(source,files){const file=path.join(source,'.export-denylist.json'),excluded=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).exclude:[];return files.filter(rel=>rel!=='.export-denylist.json'&&!excluded.some(item=>rel===item||rel.startsWith(item)));}
module.exports={seed,fixture,publicTracked};
