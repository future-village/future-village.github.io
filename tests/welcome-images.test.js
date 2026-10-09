'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {scan}=require('../scripts/export_public'),{mkTmp}=require('./_tmp');
const root=path.resolve(__dirname,'..');
function check(buf){const base=mkTmp('welcome-image-'),rel='site/assets/welcome/test.webp';fs.mkdirSync(path.dirname(path.join(base,rel)),{recursive:true});fs.writeFileSync(path.join(base,rel),buf);return scan(base,[rel]).hits;}
test('welcome WebP assets pass bounded container checks; metadata and malformed files fail',()=>{
 const dir=path.join(root,'site/assets/welcome');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.webp'))){const buf=fs.readFileSync(path.join(dir,name));assert.deepEqual(check(buf),[]);assert.ok(buf.length<(name.startsWith('hero')?150:200)*1024);}
 const good=fs.readFileSync(path.join(dir,'hero_poster_16x9.webp'));
 assert.ok(check(good.subarray(0,good.length-1)).length);
 for(const type of ['EXIF','XMP ','ICCP']){const chunk=Buffer.alloc(10);chunk.write(type);chunk.writeUInt32LE(2,4);const altered=Buffer.concat([good,chunk]);altered.writeUInt32LE(altered.length-8,4);assert.ok(check(altered).some(h=>h.includes('metadata')));}
 assert.ok(check(Buffer.from('not an image')).length);
});
