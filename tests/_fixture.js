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
   if(dir==='letters'){fs.mkdirSync(out,{recursive:true});for(const file of fs.readdirSync(src))if(/^example-(?:person|company)__example-(?:person|company)__/.test(file))fs.copyFileSync(path.join(src,file),path.join(out,file));}
   else fs.cpSync(src,out,{recursive:true});
  }
 }
 return dest;
}
function fixture(prefix='fixture-'){return seed(mkTmp(prefix));}
function publicTracked(source,files){const file=path.join(source,'.export-denylist.json'),excluded=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).exclude:[];return files.filter(rel=>rel!=='.export-denylist.json'&&!excluded.some(item=>rel===item||rel.startsWith(item)));}
module.exports={seed,fixture,publicTracked};
