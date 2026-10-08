'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildPatrol}=require('../scripts/build_patrol'),{mkTmp}=require('./_tmp');
test('patrol builder writes only requested output and leaves mail and swap sources byte-identical',()=>{
 const root=path.resolve(__dirname,'..'),snapshot=()=>['letters','swaps'].flatMap(d=>{const result=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else result.push([p,fs.readFileSync(p).toString('base64')]);}}walk(path.join(root,d));return result;});
 const before=snapshot(),out=path.join(mkTmp('patrol-write-'),'patrol.json');const result=buildPatrol(root,out);assert.ok(fs.existsSync(out));assert.ok(result.suggestions.length<=10);assert.deepEqual(snapshot(),before);
});
