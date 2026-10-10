'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {mkTmp}=require('./_tmp');
const {checkRepo,HOUSE_BYTES,HOUSE_EDGE}=require('../scripts/check_members');
const {imageIssue,imageSize,scan}=require('../scripts/export_public');
const {checkHouseOwner}=require('../scripts/check_house_owner');
const {buildWorld}=require('../scripts/build_world');
const {buildSite}=require('../scripts/build_site');
const root=path.resolve(__dirname,'..');
assert.equal(HOUSE_BYTES,400*1024);
assert.equal(HOUSE_EDGE,1024);
const meta=(made='human')=>({source:'自己畫的',rights_ok:true,desensitized_ok:true,made_by:made});
function chunk(type,data){const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length,0);b.write(type,4,'ascii');data.copy(b,8);return b;}
function tinyPng(w,h){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IEND',Buffer.alloc(0))]);
}
function tinyWebp(w,h){
 const payload=Buffer.alloc(5);payload[0]=0x2f;payload.writeUInt32LE((w-1)|((h-1)<<14),1);
 const part=Buffer.alloc(8+5);part.write('VP8L',0,'ascii');part.writeUInt32LE(5,4);payload.copy(part,8);
 const body=Buffer.concat([Buffer.from('WEBP','ascii'),part,Buffer.alloc(1)]);
 const head=Buffer.alloc(8);head.write('RIFF',0,'ascii');head.writeUInt32LE(body.length,4);
 return Buffer.concat([head,body]);
}
function writeHouse(dir,name,buf,made){
 const folder=path.join(dir,'rooms/example-person');
 fs.writeFileSync(path.join(folder,name),buf);
 fs.writeFileSync(path.join(folder,'house.json'),JSON.stringify(meta(made)));
}
const fatal=dir=>checkRepo(dir).issues.filter(i=>i.fatal);
test('crafted PNG and WebP pass the image gate and report size',()=>{
 const png=tinyPng(32,32),webp=tinyWebp(32,32);
 assert.equal(imageIssue(png,'.png'),null);assert.deepEqual(imageSize(png,'.png'),{width:32,height:32});
 assert.equal(imageIssue(webp,'.webp'),null);assert.deepEqual(imageSize(webp,'.webp'),{width:32,height:32});
 assert.equal(imageSize(tinyPng(1024,1024),'.png').width,1024);
 assert.equal(imageSize(tinyWebp(1,1024),'.webp').height,1024);
});
test('a household with no house picture stays valid and has no house_art key',()=>{
 const dir=require('./_fixture').fixture('house-none-');
 assert.deepEqual(fatal(dir),[]);
 assert.equal(checkRepo(dir).houses.has('example-person'),false);
});
test('PNG and WebP house pictures pass for all three made_by values',()=>{
 for(const made of ['human','ai_marked','ai_assisted']){
  const dir=require('./_fixture').fixture('house-ok-');
  writeHouse(dir,'house.png',tinyPng(64,64),made);
  assert.deepEqual(fatal(dir),[],made);
  assert.equal(checkRepo(dir).houses.get('example-person'),'rooms/example-person/house.png');
 }
 const dir=require('./_fixture').fixture('house-webp-');
 writeHouse(dir,'house.webp',tinyWebp(64,48),'human');
 assert.deepEqual(fatal(dir),[]);
 assert.equal(checkRepo(dir).houses.get('example-person'),'rooms/example-person/house.webp');
});
test('fake extension, oversized bytes, oversized pixels, missing json, animation and metadata fail',()=>{
 const jpg=fs.readFileSync(path.join(root,'site/assets/art/village-mobile.jpg'));
 const fake=require('./_fixture').fixture('house-fake-');
 writeHouse(fake,'house.png',jpg);
 assert.ok(fatal(fake).some(i=>i.kind.includes('未過影像檢查')));
 const big=require('./_fixture').fixture('house-big-');
 writeHouse(big,'house.png',Buffer.concat([tinyPng(8,8),Buffer.alloc(HOUSE_BYTES)]));
 assert.ok(fatal(big).some(i=>i.kind==='房子圖超過 400KB'));
 const wide=require('./_fixture').fixture('house-wide-');
 writeHouse(wide,'house.png',tinyPng(HOUSE_EDGE+1,1));
 assert.ok(fatal(wide).some(i=>i.kind==='房子圖尺寸須為 1～1024'));
 const zero=require('./_fixture').fixture('house-zero-');
 writeHouse(zero,'house.png',tinyPng(0,1));
 assert.ok(fatal(zero).some(i=>i.kind==='房子圖尺寸須為 1～1024'));
 const bare=require('./_fixture').fixture('house-bare-');
 fs.writeFileSync(path.join(bare,'rooms/example-person/house.png'),tinyPng(8,8));
 assert.ok(fatal(bare).some(i=>i.kind==='缺少 house.json'));
 const only=require('./_fixture').fixture('house-only-json-');
 fs.writeFileSync(path.join(only,'rooms/example-person/house.json'),JSON.stringify(meta()));
 assert.ok(fatal(only).some(i=>i.kind==='缺少房子圖'));
 const both=require('./_fixture').fixture('house-both-');
 fs.writeFileSync(path.join(both,'rooms/example-person/house.png'),tinyPng(8,8));
 fs.writeFileSync(path.join(both,'rooms/example-person/house.webp'),tinyWebp(8,8));
 fs.writeFileSync(path.join(both,'rooms/example-person/house.json'),JSON.stringify(meta()));
 assert.ok(fatal(both).some(i=>i.kind==='房子圖只留 PNG 或 WebP 一種'));
 const svg=require('./_fixture').fixture('house-svg-');
 fs.writeFileSync(path.join(svg,'rooms/example-person/house.svg'),'<svg><script>x</script></svg>');
 assert.ok(fatal(svg).some(i=>i.kind==='房子圖只收 PNG 或 WebP'));
 const anim=require('./_fixture').fixture('house-anim-');
 const acTL=Buffer.alloc(8);acTL.writeUInt32BE(2,0);
 writeHouse(anim,'house.png',Buffer.concat([tinyPng(8,8).subarray(0,tinyPng(8,8).length-12),chunk('acTL',acTL),tinyPng(8,8).subarray(tinyPng(8,8).length-12)]));
 assert.ok(fatal(anim).some(i=>i.kind==='房子圖必須是靜態圖'));
 const text=require('./_fixture').fixture('house-text-');
 const base=tinyPng(8,8);
 writeHouse(text,'house.png',Buffer.concat([base.subarray(0,base.length-12),chunk('tEXt',Buffer.alloc(0)),base.subarray(base.length-12)]));
 assert.ok(fatal(text).some(i=>i.kind.includes('metadata')||i.kind.includes('未過影像檢查')));
 const badMade=require('./_fixture').fixture('house-made-');
 writeHouse(badMade,'house.png',tinyPng(8,8),'ai');
 assert.ok(fatal(badMade).some(i=>i.field==='made_by'));
 const link=require('./_fixture').fixture('house-link-');
 fs.writeFileSync(path.join(link,'rooms/example-person/house.png'),tinyPng(8,8));
 fs.writeFileSync(path.join(link,'rooms/example-person/house.json'),JSON.stringify({...meta(),source:'https://example.invalid/a'}));
 assert.ok(fatal(link).some(i=>i.kind==='不收外部連結'));
});
test('edge length 1024 passes and a reserved slug is refused',()=>{
 const dir=require('./_fixture').fixture('house-edge-');
 writeHouse(dir,'house.png',tinyPng(HOUSE_EDGE,HOUSE_EDGE));
 assert.deepEqual(fatal(dir),[]);
 const reserved=require('./_fixture').fixture('house-con-');
 fs.mkdirSync(path.join(reserved,'rooms/con'));
 fs.writeFileSync(path.join(reserved,'rooms/con/house.png'),tinyPng(8,8));
 fs.writeFileSync(path.join(reserved,'rooms/con/house.json'),JSON.stringify(meta()));
 assert.equal(checkRepo(reserved).houses.has('con'),false);
 assert.ok(fatal(reserved).some(i=>i.file.startsWith('rooms/con')));
});
test('symlink house file is refused when the OS allows a test link',t=>{
 const dir=require('./_fixture').fixture('house-sym-');
 const link=path.join(dir,'rooms/example-person/house.png');
 try{fs.symlinkSync(path.join(dir,'rooms/example-person/room.json'),link);}
 catch(e){if(e&&(e.code==='EPERM'||e.code==='ENOTSUP'||e.code==='EACCES'))return t.skip('this OS refused a test symlink');throw e;}
 fs.writeFileSync(path.join(dir,'rooms/example-person/house.json'),JSON.stringify(meta()));
 assert.ok(fatal(dir).some(i=>i.kind==='房子圖必須是普通檔'));
});
test('house owner accepts only that login, including renames, and ignores intake room files',()=>{
 const members=new Map([['river',{id:'river',github:'River'}],['example-person',{id:'example-person'}]]);
 assert.deepEqual(checkHouseOwner({author:'River',files:['rooms/river/house.png','rooms/river/house.json'],members}),[]);
 assert.equal(checkHouseOwner({author:'github-actions[bot]',files:['rooms/river/room.json','members/river.json'],members}).length,0);
 const other=checkHouseOwner({author:'River',files:['rooms/other/house.webp'],members});
 assert.equal(other.length,1);assert.equal(other[0].kind,'只能改自己那戶的房子圖');
 const renamed=checkHouseOwner({author:'river',files:[{filename:'rooms/river/house.png',previous_filename:'rooms/other/house.png'}],members});
 assert.equal(renamed.length,1);
 assert.ok(checkHouseOwner({author:'river',files:['rooms/example-person/house.png'],members}).length);
 assert.deepEqual(checkHouseOwner({author:'Zaxardery8011-Design',files:['rooms/other/house.png'],members:new Map()}),[]);
 const bot=checkHouseOwner({author:'github-actions[bot]',files:['rooms/river/house.png'],members});
 assert.equal(bot[0].kind,'只能改自己那戶的房子圖');
});
test('owner CLI reads PR_FILES and does not call the network',()=>{
 const dir=mkTmp('house-owner-');
 fs.mkdirSync(path.join(dir,'members'));
 fs.writeFileSync(path.join(dir,'members/river.json'),JSON.stringify({id:'river',github:'river'}));
 const bad=cp.spawnSync(process.execPath,[path.join(root,'scripts/check_house_owner.js'),dir],{encoding:'utf8',env:{...process.env,PR_AUTHOR:'river',PR_FILES:'rooms/other/house.png\nrooms/river/room.json'}});
 assert.equal(bad.status,1);assert.match(bad.stdout,/只能改自己那戶的房子圖/);
 const ok=cp.spawnSync(process.execPath,[path.join(root,'scripts/check_house_owner.js'),dir],{encoding:'utf8',env:{...process.env,PR_AUTHOR:'river',PR_FILES:'rooms/river/house.webp'}});
 assert.equal(ok.status,0,ok.stderr);
});
test('export whitelist admits only the household house image and leaves it out of the 3MB total',()=>{
 const png=fs.readFileSync(path.join(root,'site/assets/art/icon_letter.png'));
 const dir=mkTmp('house-scan-');
 function put(rel,buf){const dest=path.join(dir,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,buf);}
 put('rooms/river/house.png',png);
 put('rooms/river/house.webp',tinyWebp(16,16));
 assert.deepEqual(scan(dir,['rooms/river/house.png','rooms/river/house.webp']).hits,[]);
 for(const rel of ['rooms/river/other.png','rooms/river/nested/house.png','rooms/con/house.png','site/assets/out.png','materials/river/house.png']){
  const one=mkTmp('house-bin-');const dest=path.join(one,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,png);
  assert.match(scan(one,[rel]).hits[0],/null byte/,rel);
 }
 const art='site/assets/art/',large=Buffer.concat([png.subarray(0,8),(()=>{const b=Buffer.alloc(350*1024);b.writeUInt32BE(b.length-12,0);b.write('IDAT',4,'ascii');return b;})(),png.subarray(png.length-12)]);
 const pack=n=>Array.from({length:n},(_,i)=>[art+i+'.png',large]);
 const eight=mkTmp('house-8-');for(const [rel,buf] of pack(8)){const dest=path.join(eight,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,buf);}
 fs.mkdirSync(path.join(eight,'rooms/river'),{recursive:true});fs.writeFileSync(path.join(eight,'rooms/river/house.png'),large);
 assert.equal(scan(eight,[...pack(8).map(x=>x[0]),'rooms/river/house.png']).hits.some(h=>h.includes('3MB')),false);
 const nine=mkTmp('house-9-');for(const [rel,buf] of pack(9)){const dest=path.join(nine,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,buf);}
 assert.equal(scan(nine,pack(9).map(x=>x[0])).hits.some(h=>h.includes('3MB')),true);
});
test('buildWorld emits house_art only for a picture that passed',()=>{
 const dir=require('./_fixture').fixture('house-world-');
 const git=(...argv)=>{const r=cp.spawnSync('git',['-C',dir,...argv],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_DATE:'2026-10-06T12:00:00+08:00',GIT_COMMITTER_DATE:'2026-10-06T12:00:00+08:00'}});assert.equal(r.status,0,r.stderr);};
 git('init');git('add','members','rooms','materials','footprints','letters','swaps');
 git('-c','user.name=Fixture','-c','user.email=283511868+zaxardery8011-design@users.noreply.github.com','commit','-m','Fixture');
 const bare=buildWorld(dir,null,{now:new Date('2026-10-08T10:00:00Z')});
 assert.equal(bare.households.find(h=>h.id==='example-person').house_art,undefined);
 writeHouse(dir,'house.png',tinyPng(32,32),'ai_assisted');
 const world=buildWorld(dir,null,{now:new Date('2026-10-08T10:00:00Z')});
 assert.equal(world.households.find(h=>h.id==='example-person').house_art,'rooms/example-person/house.png');
 assert.equal(world.households.find(h=>h.id==='example-company').house_art,undefined);
 fs.writeFileSync(path.join(dir,'rooms/example-person/house.json'),JSON.stringify(meta('nope')));
 const broken=buildWorld(dir,null,{now:new Date('2026-10-08T10:00:00Z')});
 assert.equal(broken.households.find(h=>h.id==='example-person').house_art,undefined);
});
test('buildSite copies the passing picture and house.json, and refuses a broken pair',()=>{
 const dir=mkTmp('house-site-');
 fs.cpSync(root,dir,{recursive:true,filter:src=>!src.includes(path.sep+'.git')&&!src.includes(path.sep+'_site')});
 fs.writeFileSync(path.join(dir,'rooms/example-person/house.webp'),tinyWebp(24,24));
 fs.writeFileSync(path.join(dir,'rooms/example-person/house.json'),JSON.stringify(meta('ai_marked')));
 fs.writeFileSync(path.join(dir,'rooms/example-person/note.txt'),'leave me');
 const out=path.join(mkTmp('house-out-'),'site');
 buildSite(dir,out);
 assert.equal(fs.existsSync(path.join(out,'rooms/example-person/house.webp')),true);
 assert.equal(fs.existsSync(path.join(out,'rooms/example-person/house.json')),true);
 assert.equal(fs.existsSync(path.join(out,'rooms/example-person/room.json')),true);
 assert.equal(fs.existsSync(path.join(out,'rooms/example-person/note.txt')),false);
 fs.writeFileSync(path.join(dir,'rooms/example-person/house.png'),tinyPng(8,8));
 assert.throws(()=>buildSite(dir,path.join(mkTmp('house-out2-'),'site')),/請先修正 check_members\.js 回報的失敗/);
});
test('village keeps the preset loader and falls back through applyHouseLoadError',async()=>{
 const src=fs.readFileSync(path.join(root,'site/world/village.js'),'utf8');
 assert.ok(src.includes('loader.load(paths.art(name))'));
 assert.ok(src.includes('color:HOUSE_WARM'));
 const at=src.indexOf('function customHouseMaterial');
 assert.ok(at>src.indexOf('function houseMaterial'));
 assert.ok(src.slice(at,at+1200).includes('color:0xffffff'));
 assert.ok(src.slice(at,at+1200).includes('applyHouseLoadError'));
 const v=await import('../site/world/village.js');
 assert.equal(v.houseArtPlan({id:'example-person'}).kind,'preset');
 assert.equal(v.houseArtPlan({id:'example-person'}).name,'house_'+v.houseVariant('example-person'));
 assert.equal(v.houseArtPlan({id:'example-person',house_art:'rooms/example-person/house.png'}).kind,'custom');
 assert.equal(v.houseArtPlan({id:'example-person',house_art:'rooms/example-person/house.webp'}).kind,'custom');
 for(const bad of ['rooms/example-person/house.svg','rooms/example-person/house.jpg','../rooms/example-person/house.png','rooms/con/house.png','rooms/a/b/house.png'])assert.equal(v.houseArtPlan({id:'example-person',house_art:bad}).kind,'preset',bad);
 const mesh={material:{name:'custom'},userData:{houseArt:'custom'}},preset={name:'preset'};
 assert.equal(v.applyHouseLoadError(mesh,preset),'preset');
 assert.equal(mesh.material,preset);
 assert.equal(mesh.userData.houseArt,'preset');
 const {worldPaths}=await import('../site/world/paths.mjs');
 const paths=worldPaths('https://example.test/world/village.js');
 assert.equal(paths.householdArt('rooms/river/house.png'),'https://example.test/rooms/river/house.png');
 assert.equal(paths.householdArt('rooms/console/house.webp'),'https://example.test/rooms/console/house.webp');
 assert.equal(paths.art('house_1'),'https://example.test/site/assets/art/house_1.png');
 for(const bad of ['rooms/con/house.png','rooms/com1/house.png','rooms/river/house.jpg'])assert.equal(paths.householdArt(bad),null,bad);
 const yml=fs.readFileSync(path.join(root,'.github/workflows/check.yml'),'utf8');
 assert.match(yml,/check_house_owner\.js/);
 assert.match(yml,/PR_AUTHOR/);
 assert.match(yml,/persist-credentials:\s*false/);
 assert.match(yml,/github\.event_name == 'pull_request'/);
});
