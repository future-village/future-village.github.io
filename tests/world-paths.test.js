const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('both world entrances resolve to existing shared data and art, including project subpaths',async()=>{
 const {worldPaths}=await import('../site/world/paths.mjs');
 for(const prefix of ['','/preview'])for(const entry of ['/site/world/','/world/']){
  const p=worldPaths('https://example.test'+prefix+entry+'village.js'),base='https://example.test'+prefix+'/';
  assert.equal(p.world,base+'village_world.json');assert.equal(p.patrol,base+'patrol.json');
  assert.equal(p.art('house_1'),base+'site/assets/art/house_1.png');
  assert.equal(p.street,base+'site/index.html');assert.equal(p.room('a b'),base+'site/index.html#room=a%20b');
  for(const art of ['house_1','house_6','notice_board','market','post_office','library','plaza','clown_patrol'])assert.ok(fs.existsSync(path.join(__dirname,'../site/assets/art',art+'.png')));
 }
 const source=fs.readFileSync(path.join(__dirname,'../site/world/village.js'),'utf8');
 for(const token of ['fetch(paths.world','fetch(paths.patrol','loader.load(paths.art(name))','paths.room(h.id)'])assert.ok(source.includes(token),token);
});
