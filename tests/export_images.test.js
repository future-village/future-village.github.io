'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mkTmp}=require('./_tmp'),{scan}=require('../scripts/export_public');
const root=path.resolve(__dirname,'..');
const png=fs.readFileSync(path.join(root,'site/assets/art/icon_letter.png'));
const jpg=fs.readFileSync(path.join(root,'site/assets/art/village-mobile.jpg'));
function check(entries){const dir=mkTmp('image-gate-');for(const [rel,buf] of entries){const dest=path.join(dir,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,buf);}return scan(dir,entries.map(e=>e[0]));}
const art='site/assets/art/';
function chunk(type){const b=Buffer.alloc(12);b.write(type,4,'ascii');return b;}
test('valid PNG and JPEG pass only in artwork directory',()=>assert.deepEqual(check([[art+'valid.png',png],[art+'valid.jpg',jpg],[art+'valid.jpeg',jpg]]).hits,[]));
for(const type of ['tEXt','iTXt','zTXt','eXIf'])test('reject PNG metadata '+type,()=>assert.match(check([[art+'bad.png',Buffer.concat([png.subarray(0,8),chunk(type),png.subarray(8)])]]).hits[0],/metadata/));
test('reject JPEG APP1, including after entropy scan',()=>{const app=Buffer.from([255,225,0,2]);for(const b of [Buffer.concat([jpg.subarray(0,2),app,jpg.subarray(2)]),Buffer.concat([jpg.subarray(0,jpg.length-2),app,jpg.subarray(jpg.length-2)])])assert.match(check([[art+'bad.jpg',b]]).hits[0],/APP1/);});
test('reject artwork outside allowlist and NUL JavaScript',()=>{for(const rel of ['site/assets/out.png','site/assets/art/nested/file.js','script.js'])assert.match(check([[rel,png]]).hits[0],/null byte/);});
test('reject false extensions and truncated images',()=>{for(const [name,b] of [['fake.png',jpg],['fake.jpg',png],['fake.png',Buffer.from('plain')],['short.png',png.subarray(0,30)],['short.jpg',jpg.subarray(0,30)]])assert.ok(check([[art+name,b]]).hits.length);});
test('reject oversized individual and aggregate artwork',()=>{assert.match(check([[art+'large.png',Buffer.concat([png,Buffer.alloc(400*1024)])]]).hits[0],/400KB/);const large=Buffer.concat([png.subarray(0,8),(()=>{const b=Buffer.alloc(350*1024);b.writeUInt32BE(b.length-12);b.write('IDAT',4);return b;})(),png.subarray(png.length-12)]);assert.deepEqual(check([[art+'single.png',large]]).hits,[]);assert.ok(check(Array.from({length:9},(_,i)=>[art+i+'.png',large])).hits.some(h=>h.includes('3MB')));});
test('generic mailbox patterns blocked while public GitHub account permitted',()=>{assert.deepEqual(check([['sample.md','https://github.com/future-village']]).hits,[]);assert.ok(check([['sample.md','sample'+'@gm'+'ail.com']]).hits.length);});
