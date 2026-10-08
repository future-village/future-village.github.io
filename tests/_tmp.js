'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const created=new Map();
const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel!==''&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)};
function noLinks(target){for(let current=target;;current=path.dirname(current)){if(fs.lstatSync(current).isSymbolicLink())throw new Error('Link refused');if(path.dirname(current)===current)break;}}
function mkTmp(prefix){if(!/^[a-z0-9-]+$/i.test(prefix))throw new Error('Invalid prefix');const base=fs.realpathSync(os.tmpdir());noLinks(base);const root=fs.realpathSync(fs.mkdtempSync(path.join(base,prefix)));created.set(root,prefix);return root;}
function safeRm(root,rel){
 if(typeof rel!=='string'||!rel||path.isAbsolute(rel)||rel.split(/[\\/]/).includes('..')||/[?*]/.test(rel))throw new Error('Invalid relative target');
 noLinks(root);const realRoot=fs.realpathSync(root),prefix=created.get(realRoot),base=fs.realpathSync(os.tmpdir());
 if(!prefix||!inside(base,realRoot)||!path.basename(realRoot).startsWith(prefix))throw new Error('Unregistered temporary root');
 const target=path.resolve(realRoot,rel);if(!inside(realRoot,target))throw new Error('Escaping target');noLinks(target);
 if(!inside(realRoot,fs.realpathSync(target)))throw new Error('Escaping real target');
 function walk(file){if(fs.lstatSync(file).isSymbolicLink())throw new Error('Link refused');if(fs.lstatSync(file).isDirectory())for(const name of fs.readdirSync(file))walk(path.join(file,name));}walk(target);
 const trashBase=path.join(base,'future-village-quarantine');fs.mkdirSync(trashBase,{recursive:true});noLinks(trashBase);const trash=path.join(trashBase,require('node:crypto').randomUUID());if(fs.existsSync(trash))throw new Error('Destination exists');fs.renameSync(target,trash);
}
module.exports={mkTmp,safeRm};
