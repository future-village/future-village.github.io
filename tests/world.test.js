const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {mkTmp}=require('./_tmp');
const {buildWorld,village,plot}=require('../scripts/build_world');
test('level boundaries and bounded progress',()=>{for(const [n,level,next] of [[0,'village',100],[99,'village',100],[100,'town',300],[299,'town',300],[300,'city',null]]){const v=village(n);assert.equal(v.level,level);assert.equal(v.next_level_at,next);assert.ok(v.progress>=0&&v.progress<=1);}});
test('plot stable, independent of input order and distinct',()=>{const ids=Array.from({length:1000},(_,i)=>'house-'+i);assert.equal(new Set(ids.map(id=>JSON.stringify(plot(id)))).size,ids.length);for(const id of ids.reverse())assert.deepEqual(plot(id),plot(id));});
test('git fixture events, dates, visibility, counters and output',()=>{
 const root=mkTmp('world-');
 require('./_fixture').seed(root);
 const write=(rel,value)=>{fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),typeof value==='string'?value:JSON.stringify(value));};
 const git=(...argv)=>{const r=cp.spawnSync('git',['-C',root,...argv],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_DATE:'2026-10-06T12:00:00+08:00',GIT_COMMITTER_DATE:'2026-10-06T12:00:00+08:00'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init');const commit=(files=['.'])=>{git('add',...files);git('-c','user.name=Fixture','-c','user.email=283511868+zaxardery8011-design@users.noreply.github.com','commit','-m','Fixture');};commit(['members','rooms','materials']);commit(['swaps']);commit(['letters']);commit(['footprints']);
 write('library/book.json',{title:'測試書',summary:'一句話',source_url:'https://example.org/book',tags:[],added_by:'example-person',made_by:'human',license:'CC BY 4.0',do_not_execute:true});commit(['library']);
 const world=buildWorld(root,path.join(root,'output.json'),{now:new Date('2026-10-08T10:00:00Z')});
 assert.deepEqual(new Set(world.events.map(e=>e.type)),new Set(['move_in','swap','letter_sent','letter_delivered','visit','book_added']));
 for(let i=1;i<world.events.length;i++)assert.ok(Date.parse(world.events[i-1].ts)>=Date.parse(world.events[i].ts));
 assert.equal(world.households.find(h=>h.id==='example-person').moved_in_at,'2026-10-06T12:00:00+08:00');
 assert.ok(world.events.filter(e=>['move_in','swap','visit','book_added'].includes(e.type)).every(e=>Date.parse(e.ts)===Date.parse('2026-10-06T12:00:00+08:00')));
 const again=buildWorld(root,path.join(root,'again.json'),{now:new Date('2026-10-09T10:00:00Z')});assert.deepEqual(world.events.map(e=>e.id),again.events.map(e=>e.id));
 const swapFile='swaps/example-company__example-person.json',swap=JSON.parse(fs.readFileSync(path.join(root,swapFile)));swap.completed_on='2026-10-08';write(swapFile,swap);
 const dated=buildWorld(root,path.join(root,'dated.json'),{now:new Date('2026-10-08T10:00:00Z')});assert.equal(dated.kpi.swaps_today,1);assert.equal(dated.events.find(e=>e.type==='swap').day,'2026-10-08');assert.ok(!require('../scripts/check_members').checkRepo(root).issues.some(i=>i.fatal));
 swap.completed_on='2026-02-30';write(swapFile,swap);assert.ok(require('../scripts/check_members').checkRepo(root).issues.some(i=>i.field==='completed_on'&&i.fatal));delete swap.completed_on;write(swapFile,swap);
 assert.equal(world.village.shown,3);for(const e of world.events){assert.match(e.id,/^[a-f0-9]{64}$/);assert.equal(e.from,e.actors[0]||null);assert.equal(e.to,e.actors[1]||e.actors[0]||null);assert.equal(e.day,require('../scripts/check_members').taipeiToday(new Date(e.ts)));assert.ok(!('body' in e));}
 assert.equal(world.kpi.books,1);assert.equal(world.village.households,0);assert.equal(world.kpi.swaps_total,1);
 assert.ok(world.events.filter(e=>e.type.startsWith('letter')).every(e=>e.ts.endsWith('T00:00:00+08:00')));
 write('footprints/example-person.jsonl',Array(60).fill(JSON.stringify({room:'example-company',date:'2026-10-06',note:'測試拜訪'})).join('\n')+'\n');commit(['footprints']);
 const busy=buildWorld(root,path.join(root,'busy.json'),{now:new Date('2026-10-06T10:00:00Z')});assert.equal(busy.events.length,50);assert.equal(busy.kpi.visits_today,61);
 const member=JSON.parse(fs.readFileSync(path.join(root,'members/example-person.json')));member.owner_consent=false;write('members/example-person.json',member);
 const hidden=buildWorld(root,path.join(root,'hidden.json'));
 assert.ok(!JSON.stringify(hidden).includes('example-person'));assert.ok(!JSON.stringify(hidden).includes(member.handle));
 assert.ok(JSON.stringify(hidden).includes('aiwff-main-brain'));
 assert.equal(hidden.kpi.swaps_total,0);assert.equal(hidden.kpi.letters_in_transit,0);assert.equal(hidden.kpi.books,1);
});

test('village source wires the house plane, contact shadows and pitch clamp',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../site/world/village.js'),'utf8');
 assert.match(src,/assignContactShadows\(contactShadows,\s*count\)/);
 assert.match(src,/poseHouse\(/);
 assert.match(src,/clampPitch\(pitch\)/);
 assert.match(src,/cameraPose\(target\.x,target\.y,target\.z,distance,pitch,yaw\)/);
});
test('house mesh bottom equals ground height, contact shadows match houses, pitch stays capped',async()=>{
 const T=await import('../site/world/assets/vendor/js/three/three.module.min.js');
 const v=await import('../site/world/village.js');
 const mesh=new T.Mesh(new T.PlaneGeometry(1,1));
 const bottom=v.poseHouse(mesh,12,-4,.4,v.HOUSE_H);
 assert.ok(Math.abs(bottom-v.GROUND_TOP_Y)<1e-9);
 assert.ok(Math.abs(mesh.position.y-mesh.scale.y/2-v.GROUND_TOP_Y)<1e-9);
 assert.equal(mesh.rotation.x,0);
 assert.equal(mesh.rotation.z,0);
 assert.equal(mesh.rotation.y,.4);
 const shadows={count:-1};
 assert.equal(v.assignContactShadows(shadows,41),41);
 assert.equal(shadows.count,41);
 assert.equal(v.contactShadowInstanceCount(0),0);
 assert.equal(v.contactShadowInstanceCount(512),512);
 const over=v.cameraPose(0,0,30,215,Math.PI/2,.7);
 assert.ok(over.pitch<=v.CAMERA_PITCH_MAX+1e-9);
 assert.ok(Math.abs(over.pitch-v.CAMERA_PITCH_MAX)<1e-9);
 assert.ok(Math.abs(v.CAMERA_PITCH_MAX-Math.PI/3)<1e-9);
 assert.ok(v.CAMERA_PITCH_DEFAULT<Math.atan2(.78,.7));
 assert.ok(v.CAMERA_PITCH_DEFAULT<v.CAMERA_PITCH_MAX);
 let pitch=v.CAMERA_PITCH_DEFAULT;
 for(let i=0;i<500;i++)pitch=v.clampPitch(pitch+.08);
 assert.equal(pitch,v.CAMERA_PITCH_MAX);
 for(let i=0;i<500;i++)pitch=v.clampPitch(pitch-.08);
 assert.equal(pitch,v.CAMERA_PITCH_MIN);
});
test('ground cap, toon ramp, thickened tapered island, ink shell and a bent lane',async()=>{
 const T=await import('../site/world/assets/vendor/js/three/three.module.min.js');
 const g=await import('../site/world/ground.mjs');
 const scene=new T.Scene();
 g.buildGround(scene);
 const slabs=scene.children.filter(o=>o.userData.role==='slab');
 const cap=slabs.find(o=>Math.abs(o.userData.top-g.GROUND_TOP_Y)<1e-9);
 assert.ok(cap);
 cap.geometry.computeBoundingBox();
 assert.ok(Math.abs(cap.position.y+cap.geometry.boundingBox.max.y-g.GROUND_TOP_Y)<1e-3);
  assert.equal(cap.material.type,'MeshBasicMaterial');
  assert.equal(cap.material.color.getHex(),g.SURFACE_TINT);
  assert.equal(cap.material.fog,true);
  assert.equal(cap.material.map.wrapS,T.RepeatWrapping);
  assert.equal(cap.material.map.wrapT,T.RepeatWrapping);
  assert.match(cap.material.map.userData.src,/tile_grass\.png$/);
  const side=slabs.find(o=>o!==cap&&o.material.type==='MeshToonMaterial');
  assert.ok(side);
  const gradient=side.material.gradientMap;
  assert.equal(gradient.isDataTexture,true);
  assert.equal(gradient.image.width,3);
  assert.equal(gradient.image.height,1);
  assert.equal(gradient.magFilter,T.NearestFilter);
  assert.equal(gradient.minFilter,T.NearestFilter);
  assert.equal(gradient.generateMipmaps,false);
 const oldSpan=.3-(-12),lowest=Math.min(...slabs.map(o=>o.userData.bottom));
 assert.ok(g.GROUND_TOP_Y-lowest>=oldSpan*3);
 assert.ok(slabs.length>=5);
 const shells=scene.children.filter(o=>o.userData.role==='shell');
 assert.equal(shells.length,slabs.length);
 assert.ok(g.OUTLINE_SCALE>=1.01&&g.OUTLINE_SCALE<=1.02);
 for(const shell of shells){assert.equal(shell.material.side,T.BackSide);assert.equal(shell.material.color.getHex(),g.PALETTE.ink);assert.ok(Math.abs(shell.scale.x-g.OUTLINE_SCALE)<1e-6);}
 const north=scene.children.filter(o=>o.userData.lane==='north');
 assert.ok(north.length>=4);
  assert.equal(north[0].material.type,'MeshBasicMaterial');
  assert.equal(north[0].material.color.getHex(),g.SURFACE_TINT);
  assert.equal(north[0].material.map.wrapS,T.RepeatWrapping);
  assert.match(north[0].material.map.userData.src,/tile_path_stone\.png$/);

 assert.ok(new Set(north.map(o=>o.position.z.toFixed(2))).size>1);
});

test('route C cards replace procedural trees and stay planted',async()=>{
  const T=await import('../site/world/assets/vendor/js/three/three.module.min.js');
  const v=await import('../site/world/village.js');
  const g=await import('../site/world/ground.mjs');
  const villageSrc=fs.readFileSync(path.join(__dirname,'../site/world/village.js'),'utf8');
  const groundSrc=fs.readFileSync(path.join(__dirname,'../site/world/ground.mjs'),'utf8');
  for(const hex of ['0x6d9866','0x8a9b65','0xffd58a','0xffdfa0'])assert.equal(villageSrc.includes(hex),false,hex);
  for(const hex of ['0x526f47','0xe9c075','0xd9908b','0xe7dccc','0x8f6d48','0xd0b58a','0xc0a477'])assert.equal(groundSrc.includes(hex),false,hex);
  assert.match(villageSrc,/buildPropCards\(scene,\s*shadowMat\)/);
  assert.match(villageSrc,/propCards\.update\(camera\)/);
  const scene=new T.Scene();
  g.buildGround(scene);
  const props=v.buildPropCards(scene);
  const spots=[];
  for(let i=0;i<24;i++)spots.push([i%2?78:-78,-55+Math.floor(i/2)*10]);
  let proceduralTrees=0;
  scene.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh)return;
    const geo=o.geometry;
    if(!geo||(geo.type!=='BoxGeometry'&&geo.type!=='SphereGeometry'))return;
    if(spots.some(([x,z])=>Math.abs(o.position.x-x)<1e-6&&Math.abs(o.position.z-z)<1e-6))proceduralTrees++;
  });
  assert.equal(proceduralTrees,0);
  assert.equal(props.counts.tree_round+props.counts.tree_pine,24);
  assert.equal(props.counts.lamp,18);
  assert.equal(props.counts.bush_flowers,12);
  assert.equal(props.counts.fence,6);
  for(const kind of ['tree_round','tree_pine','bush_flowers','lamp','bench','fence'])assert.ok(props.counts[kind]>0,kind);
  for(let i=0;i<12;i++){
    const z=-55+i*10;
    assert.ok(props.layout.tree_round.some(p=>p.x===-78&&p.z===z));
    assert.ok(props.layout.tree_pine.some(p=>p.x===78&&p.z===z));
  }
  assert.equal(props.layout.lamp[0].x,-68);assert.equal(props.layout.lamp[17].x,68);assert.equal(props.layout.lamp[0].z,58);
  assert.equal(props.layout.bush_flowers[0].x,79);assert.equal(props.layout.bush_flowers[0].z,-57);
  assert.ok(props.layout.fence.some(p=>p.x===-43&&p.z===-40&&p.yaw===0));
  assert.ok(props.layout.fence.some(p=>p.x===-56&&p.z===72&&p.yaw===0));
  const matrix=new T.Matrix4(),pos=new T.Vector3(),quat=new T.Quaternion(),scale=new T.Vector3();
  for(const [kind,mesh] of Object.entries(props.meshes)){
    assert.equal(mesh.geometry.type,'PlaneGeometry');
    assert.equal(mesh.material.alphaTest,v.PROP_ALPHA_TEST);
    assert.equal(mesh.material.transparent,false);
    assert.equal(mesh.material.depthWrite,true);
    assert.equal(mesh.material.fog,true);
    assert.equal(mesh.material.color.getHex(),v.HOUSE_WARM);
    assert.equal(mesh.material.side,kind==='fence'?T.DoubleSide:T.FrontSide);
    assert.match(mesh.material.map.userData.src,new RegExp(kind+'\\.png$'));
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);
      assert.ok(Math.abs(v.houseMeshBottomY(pos.y,scale.y)-v.GROUND_TOP_Y)<1e-6,kind);
    }
  }
  function fenceYaws(){
    const out=[];
    for(let i=0;i<props.meshes.fence.count;i++){
      props.meshes.fence.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);
      out.push(new T.Euler().setFromQuaternion(quat,'XYZ').y);
    }
    return out;
  }
  const before=fenceYaws();
  for(const y of before)assert.ok(Math.abs(y)<1e-6);
  props.update({position:{x:100,y:40,z:-20}});
  props.update({position:{x:-90,y:15,z:70}});
  const after=fenceYaws();
  assert.equal(after.length,before.length);
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(after[i]-before[i])<1e-6);
  const lamp=props.layout.lamp[0];
  props.update({position:{x:lamp.x+10,y:30,z:lamp.z}});
  props.meshes.lamp.getMatrixAt(0,matrix);matrix.decompose(pos,quat,scale);
  assert.ok(Math.abs(new T.Euler().setFromQuaternion(quat,'XYZ').y-Math.PI/2)<1e-5);
  assert.equal(props.shadows.count,props.counts.tree_round+props.counts.tree_pine+props.counts.lamp);
  for(let i=0;i<props.shadows.count;i++){
    props.shadows.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);
    assert.ok(scale.x<18&&scale.z<12);
    assert.ok(Math.abs(pos.y-(v.GROUND_TOP_Y+.04))<1e-6);
  }
});
test('grass cap and stone lanes use repeating painted tiles',async()=>{
  const T=await import('../site/world/assets/vendor/js/three/three.module.min.js');
  const g=await import('../site/world/ground.mjs');
  const scene=new T.Scene();
  g.buildGround(scene);
  const slabs=scene.children.filter(o=>o.userData.role==='slab');
  const cap=slabs.find(o=>Math.abs(o.userData.top-g.GROUND_TOP_Y)<1e-9);
  const sides=slabs.filter(o=>o!==cap);
  assert.ok(sides.length>=4);
  assert.ok(sides.every(o=>o.material.type==='MeshToonMaterial'));
  let grassUv=0;const guv=cap.geometry.attributes.uv;
  for(let i=0;i<guv.count;i++)grassUv=Math.max(grassUv,Math.abs(guv.getX(i)),Math.abs(guv.getY(i)));
  assert.ok(grassUv>5&&grassUv<20);
  const north=scene.children.filter(o=>o.userData.lane==='north');
  let pathUv=0;
  for(const lane of north){const uv=lane.geometry.attributes.uv;for(let i=0;i<uv.count;i++)pathUv=Math.max(pathUv,Math.abs(uv.getX(i)),Math.abs(uv.getY(i)));}
  assert.ok(pathUv>1.2);
  const shells=scene.children.filter(o=>o.userData.role==='shell');
  assert.equal(shells.length,slabs.length);
});
