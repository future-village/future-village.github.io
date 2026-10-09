import * as T from './assets/vendor/js/three/three.module.min.js';
import {model,newEvents,route,roadsidePlots} from './data.mjs';
import {worldPaths} from './paths.mjs';
import {buildGround,eveningSky,toonRamp,GROUND_TOP_Y} from './ground.mjs';

export {GROUND_TOP_Y};
export const HOUSE_W=22,HOUSE_H=26,HOUSE_WARM=0xfff0e0,HOUSE_ALPHA_TEST=.4;
export const CAMERA_PITCH_MAX=Math.PI/3,CAMERA_PITCH_MIN=18*Math.PI/180,CAMERA_PITCH_DEFAULT=32*Math.PI/180;
const PAD_COLOR=0xf3e4c6,PAD_H=.42,PAD_W=15,PAD_D=11;

export function clampPitch(pitch){return Math.min(CAMERA_PITCH_MAX,Math.max(CAMERA_PITCH_MIN,pitch));}
export function housePlanePositionY(groundY,height){return groundY+height/2;}
// PlaneGeometry(1,1) is centered, so the bottom edge is position.y - scale.y/2. Yaw does not change that y.
export function houseMeshBottomY(positionY,scaleY){return positionY-scaleY/2;}
export function layHouse(mesh,x,z,height=HOUSE_H){
  mesh.scale.set(HOUSE_W,height,1);
  mesh.position.set(x,housePlanePositionY(GROUND_TOP_Y,height),z);
  mesh.rotation.x=0;mesh.rotation.z=0;
  return houseMeshBottomY(mesh.position.y,mesh.scale.y);
}
export function poseHouse(mesh,x,z,yaw,height=HOUSE_H){const bottom=layHouse(mesh,x,z,height);mesh.rotation.y=yaw;return bottom;}
export function contactShadowInstanceCount(houseCount){return houseCount;}
export function assignContactShadows(mesh,houseCount){mesh.count=contactShadowInstanceCount(houseCount);return mesh.count;}
// Pitch is the depression angle from the horizon: 0 looks sideways, PI/2 looks straight down.
export function cameraPose(targetX,targetY,targetZ,distance,pitch,yaw){
  const p=clampPitch(pitch),horizontal=Math.cos(p)*distance;
  const position={x:targetX+Math.sin(yaw)*horizontal,y:targetY+Math.sin(p)*distance,z:targetZ+Math.cos(yaw)*horizontal};
  const measured=Math.atan2(position.y-targetY,Math.hypot(position.x-targetX,position.z-targetZ));
  return {position,pitch:measured};
}

const page=typeof document!=='undefined'&&document.getElementById&&document.getElementById('stage');
if(page)start();

function start(){
  const paths=worldPaths(import.meta.url);
  document.querySelector('header a').href=paths.street;
  const $=id=>document.getElementById(id),low=new URLSearchParams(location.search).has('lowfx'),mobile=innerWidth<600;
  let renderer;try{renderer=new T.WebGLRenderer({antialias:!low});}catch{location.replace(paths.street);throw Error('WebGL unavailable');}
  renderer.shadowMap.enabled=!low;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,mobile?1.25:1.5));renderer.setSize(innerWidth,innerHeight);$('stage').append(renderer.domElement);
  const scene=new T.Scene();scene.background=eveningSky();scene.fog=new T.Fog('#d4b4ac',280,550);
  const camera=new T.PerspectiveCamera(mobile?65:42,innerWidth/innerHeight,.1,600);
  scene.add(new T.HemisphereLight(0xffe4bd,0x677461,2));
  const sun=new T.DirectionalLight(0xffc28a,2.2);sun.position.set(-65,95,50);sun.castShadow=!low;
  sun.shadow.mapSize.set(mobile?512:1024,mobile?512:1024);Object.assign(sun.shadow.camera,{left:-115,right:115,top:115,bottom:-115,near:1,far:260});sun.shadow.normalBias=.08;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun);
  buildGround(scene);
  const box=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,8,6),colors=new Map();
  function mat(color){if(!colors.has(color))colors.set(color,new T.MeshLambertMaterial({color}));return colors.get(color);}
  function mesh(geo,color,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geo,mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
  const labels=[],homeMeshes=new Map(),homes=new Map();let world,seen=new Set(),started=false,lastInput=performance.now(),yaw=.7,pitch=CAMERA_PITCH_DEFAULT,distance=mobile?245:215,target=new T.Vector3(0,0,30),drag=null,tour=0;
  function label(text,x,y,z,house){const el=document.createElement('div');el.className='label'+(house?' house':'');el.textContent=text;document.body.append(el);labels.push({el,p:new T.Vector3(x,y,z),house});return el;}
  const textures=new Map(),spriteMaterials=new Map(),loader=new T.TextureLoader();
  function spriteMaterial(name){if(!spriteMaterials.has(name)){const texture=loader.load(paths.art(name));texture.colorSpace=T.SRGBColorSpace;textures.set(name,texture);spriteMaterials.set(name,new T.SpriteMaterial({map:texture,transparent:true,alphaTest:.04,depthWrite:false}));}return spriteMaterials.get(name);}
  function sprite(name,x,y,z,size){const m=new T.Sprite(spriteMaterial(name));m.position.set(x,y,z);m.scale.set(size,size,1);scene.add(m);return m;}
  const zones=[['村口告示牌',0,78,'notice_board',16],['交換市集',-40,57,'market'],['郵局',0,57,'post_office'],['書架館',40,57,'library'],['廣場',0,-57,'plaza']];
  for(const [name,x,z,art,size=28] of zones){sprite(art,x,12,z,size);label(name,x,29,z);}
  for(let i=0;i<18;i++){const x=-68+i*8;mesh(box,0xffd58a,x,3,58,.4,6,.4);mesh(sphere,0xffdfa0,x,6,58,.8,.8,.8);}
  function houseVariant(id){let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619);return 1+(hash>>>0)%6;}
  const houseGeo=new T.PlaneGeometry(1,1),houseMats=new Map();
  function houseMaterial(name){
    if(!houseMats.has(name)){
      const texture=loader.load(paths.art(name));texture.colorSpace=T.SRGBColorSpace;textures.set(name,texture);
      const material=new T.MeshLambertMaterial({map:texture,color:HOUSE_WARM,alphaTest:HOUSE_ALPHA_TEST,transparent:false,fog:true,premultipliedAlpha:false});
      material.depthWrite=true;houseMats.set(name,material);
    }
    return houseMats.get(name);
  }
  const houseMeshes=Array.from({length:512},()=>{const m=new T.Mesh(houseGeo,houseMaterial('house_1'));m.visible=false;m.castShadow=m.receiveShadow=false;m.renderOrder=2;scene.add(m);return m;});
  function contactShadowTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d'),brush=g.createRadialGradient(64,64,6,64,64,62);
    brush.addColorStop(0,'rgba(47,70,78,.38)');brush.addColorStop(.45,'rgba(47,70,78,.16)');brush.addColorStop(1,'rgba(47,70,78,0)');
    g.fillStyle=brush;g.fillRect(0,0,128,128);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;return texture;
  }
  const shadowGeo=new T.PlaneGeometry(1,1);shadowGeo.rotateX(-Math.PI/2);
  const shadowMat=new T.MeshBasicMaterial({map:contactShadowTexture(),transparent:true,depthWrite:false,fog:true});
  shadowMat.polygonOffset=true;shadowMat.polygonOffsetFactor=-2;shadowMat.polygonOffsetUnits=-2;
  const contactShadows=new T.InstancedMesh(shadowGeo,shadowMat,512);contactShadows.count=0;contactShadows.frustumCulled=false;contactShadows.castShadow=false;contactShadows.receiveShadow=false;contactShadows.renderOrder=1;scene.add(contactShadows);
  const pads=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshToonMaterial({color:PAD_COLOR,gradientMap:toonRamp()}),512);
  pads.count=0;pads.frustumCulled=false;pads.castShadow=false;pads.receiveShadow=true;scene.add(pads);
  const dummy=new T.Object3D();
  function placeInstance(mesh,i,x,y,z,sx,sy,sz){dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
  label('住宅區',0,2,15);const bookLabel=label('書架等第一本',40,4,57);
  const emptyPlots=[];
  function syncEmptyPlots(count){for(const p of emptyPlots){scene.remove(p.mesh,p.post,p.sign);p.label.el.remove();labels.splice(labels.indexOf(p.label),1);}emptyPlots.length=0;for(const p of roadsidePlots(count+6).slice(count)){const pad=mesh(box,0x8c9b70,p.x,.5,p.z,18,.15,16),post=mesh(box,0x795438,p.x,2,p.z,1,4,1),sign=mesh(box,0xae855a,p.x,4,p.z,7,2,.5);label("空地・等你搬來",p.x,5,p.z);emptyPlots.push({mesh:pad,post,sign,label:labels.at(-1)});}}
  for(let i=0;i<24;i++){const x=i%2?78:-78,z=-55+Math.floor(i/2)*10;mesh(box,0x8a9b65,x,2,z,1,4,1);mesh(sphere,0x6d9866,x,6,z,3,4,3);}
  const pool=Array.from({length:24},()=>({m:mesh(box,0xdb9371,0,0,0,1.5,1.5,1.5),active:false}));for(const p of pool)p.m.visible=false;
  const footprints=new T.InstancedMesh(sphere,mat(0x7e6453),512);footprints.count=0;footprints.frustumCulled=false;scene.add(footprints);const visited=new Set();
  function footprint(id){if(visited.has(id)||!homes.has(id)||footprints.count===512)return;visited.add(id);const p=homes.get(id);dummy.position.set(p.x+4,.8,p.z+4);dummy.scale.set(.8,.2,.5);dummy.rotation.set(0,0,0);dummy.updateMatrix();footprints.setMatrixAt(footprints.count++,dummy.matrix);footprints.instanceMatrix.needsUpdate=true;}
  function focus(p){target.set(p.x,0,p.z);distance=mobile?105:85;lastInput=performance.now();}
  function select(h){focus(h.position);$('drawer').hidden=false;$('house-name').textContent=h.handle;$('missing').textContent=h.missing||'這戶正在慢慢整理房間。';$('enter').href=paths.room(h.id);}
  renderer.domElement.addEventListener('pointerdown',e=>{lastInput=performance.now();drag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(drag){yaw+=(e.clientX-drag.x)*.006;pitch=clampPitch(pitch-(e.clientY-drag.y)*.004);drag={x:e.clientX,y:e.clientY};lastInput=performance.now();}});
  renderer.domElement.addEventListener('pointerup',e=>{drag=null;const rect=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);const hit=ray.intersectObjects(houseMeshes.filter(m=>m.visible))[0];if(hit)select(world.households[hit.object.userData.index]);});
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(55,Math.min(320,distance+e.deltaY*.1));lastInput=performance.now();},{passive:false});renderer.domElement.style.touchAction='none';
  let pinch=0;renderer.domElement.addEventListener('touchmove',e=>{if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinch)distance=Math.max(55,Math.min(320,distance+pinch-d));pinch=d;lastInput=performance.now();}},{passive:true});renderer.domElement.addEventListener('touchend',()=>pinch=0);
  function overview(){target.set(0,0,30);distance=mobile?245:215;lastInput=performance.now();}$('overview').onclick=overview;$('close').onclick=()=>$('drawer').hidden=true;$('map-button').onclick=()=>$('map').classList.toggle('open');
  function animateEvent(e){if(e.type==='visit'){footprint(e.to);return;}if(e.type==='move_in'){const index=world.households.findIndex(h=>h.id===e.to);if(index>=0)growing.set(index,performance.now());return;}if(!['swap','letter_sent','letter_delivered'].includes(e.type))return;const paths=[route(e,homes)];if(e.type==='swap')paths.push(route({...e,from:e.to,to:e.from},homes));for(const points of paths){const p=pool.find(p=>!p.active);if(!p)break;Object.assign(p,{active:true,points,start:performance.now(),event:e});p.m.visible=true;p.m.material=mat(e.type==='swap'?0xda9d65:0x7eb8cb);}}
  const growing=new Map();
  function sync(raw){
    world=model(raw);homes.clear();for(const h of world.households)homes.set(h.id,h.position);const count=Math.min(512,world.households.length);
    assignContactShadows(contactShadows,count);pads.count=contactShadows.count;
    for(let i=0;i<512;i++)houseMeshes[i].visible=i<count;
    for(const index of growing.keys())if(index>=count)growing.delete(index);
    for(let i=0;i<count;i++){
      const h=world.households[i],p=h.position,art=houseMeshes[i];
      art.material=houseMaterial('house_'+houseVariant(h.id));art.userData.index=i;poseHouse(art,p.x,p.z,0,HOUSE_H);
      placeInstance(pads,i,p.x,GROUND_TOP_Y-PAD_H/2,p.z,PAD_W,PAD_H,PAD_D);
      placeInstance(contactShadows,i,p.x,GROUND_TOP_Y+.04,p.z,18,1,12);
      if(!homeMeshes.has(h.id)){const l=label(h.handle,p.x,GROUND_TOP_Y+HOUSE_H+2,p.z,true);l.onclick=()=>select(h);homeMeshes.set(h.id,l);}
    }
    contactShadows.instanceMatrix.needsUpdate=pads.instanceMatrix.needsUpdate=true;
    syncEmptyPlots(count);labels.find(l=>l.el.textContent.startsWith('住宅區')).el.textContent=count?'住宅區':'住宅區 · 空地・等你搬來';bookLabel.textContent=world.kpi.books?'書架 '+world.kpi.books+' 本':'書架等第一本';$('title').textContent='未來'+({village:'村',town:'鎮',city:'城'}[world.village.level]||'村');$('cards').replaceChildren();for(const [name,key] of [['這週有動的戶','active_households_7d'],['在路上的信','letters_in_transit'],['今天互換','swaps_today'],['今天搬入','moved_in_today']]){const c=document.createElement('button');c.className='card';const n=document.createElement('strong');n.textContent=world.kpi[key]||0;const s=document.createElement('span');s.textContent=name;c.append(n,s);c.onclick=overview;$('cards').append(c);}
    $('timeline').replaceChildren();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());for(const e of world.events.filter(e=>e.day===today)){const b=document.createElement('button');b.textContent=e.ts.slice(11,16)+' '+e.text;b.onclick=()=>focus(homes.get(e.to)||{x:0,z:57});$('timeline').append(b);}for(const e of world.events)if(e.type==='visit')footprint(e.to);for(const e of newEvents(world.events,seen,!started))animateEvent(e);started=true;$('status').textContent='每分鐘更新 · 未來'+world.village.level_name+'徽章';
  }
  let suggestions=[],patrolIndex=0,patrolTime=0;const clown=sprite('clown_patrol',0,5,60,13);label('小丑 · 只提出建議',0,9,60);
  async function refresh(){try{const r=await fetch(paths.world,{cache:'no-store'});if(!r.ok)throw Error('讀取失敗');sync(await r.json());const p=await fetch(paths.patrol,{cache:'no-store'});if(p.ok)suggestions=(await p.json()).suggestions||[];}catch(e){$('status').textContent='暫時讀不到更新，保留目前村子。';}}refresh();setInterval(refresh,60000);
  let last=performance.now(),slow=0,degraded=low,ticks=0,lastTour=0;window.worldMetrics={frames:0,pixelRatio:renderer.getPixelRatio(),degraded:false,shadowMapSize:sun.shadow.mapSize.x,shadows:renderer.shadowMap.enabled};
  function frame(now){
    requestAnimationFrame(frame);if(document.hidden){last=now;return;}const dt=now-last;last=now;ticks++;window.worldMetrics.frames=ticks;
    if(dt>25&&dt<500)slow+=dt;else slow=0;if(slow>2000){if(!degraded){renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;window.worldMetrics.shadows=false;degraded=true;window.worldMetrics.degraded=true;window.worldMetrics.pixelRatio=1;slow=0;}else{location.replace(paths.street);return;}}
    if(now-lastInput>45000&&now-lastTour>6500){const stops=[{x:0,z:0},...zones.map(z=>({x:z[1],z:z[2]})),...(world?.households.slice(0,3).map(h=>h.position)||[])];target.set(stops[tour%stops.length].x,0,stops[tour++%stops.length].z);distance=tour%5===0?230:110;lastTour=now;}
    pitch=clampPitch(pitch);const posed=cameraPose(target.x,target.y,target.z,distance,pitch,yaw);camera.position.set(posed.position.x,posed.position.y,posed.position.z);camera.lookAt(target);
    for(let i=0;i<houseMeshes.length;i++){
      const art=houseMeshes[i];if(!art.visible)continue;let height=HOUSE_H;
      if(growing.has(i)){const scale=Math.min(1,(now-growing.get(i))/1000);height=HOUSE_H*Math.max(.01,scale);if(scale===1)growing.delete(i);}
      poseHouse(art,art.position.x,art.position.z,Math.atan2(camera.position.x-art.position.x,camera.position.z-art.position.z),height);
    }
    for(const p of pool)if(p.active){const progress=Math.min(1,(now-p.start)/5000),segments=p.points.length-1,j=Math.min(segments-1,Math.floor(progress*segments)),fraction=progress*segments-j,a=p.points[j],b=p.points[j+1];p.m.position.set(a.x+(b.x-a.x)*fraction,2,b.z===a.z?a.z:a.z+(b.z-a.z)*fraction);if(progress===1){p.active=false;p.m.visible=p.event.type==='letter_sent';}}
    $('moving').textContent=pool.filter(p=>p.active).map(p=>p.event.text).slice(0,12).join(' · ')||'村裡正安靜';
    if(suggestions.length){if(now-patrolTime>14000){patrolTime=now;patrolIndex=(patrolIndex+1)%suggestions.length;}$('bubble').textContent=suggestions[patrolIndex].text;const s=suggestions[patrolIndex],a=homes.get(s.from)||{x:0,z:58},b=homes.get(s.to)||a,t=Math.min(1,(now-patrolTime)/10000);const z=t<.5?a.z+(58-a.z)*t*2:58+(b.z-58)*(t-.5)*2;clown.position.set(a.x+(b.x-a.x)*t,5,z);const l=labels.find(l=>l.el.textContent.startsWith('小丑'));l.p.set(clown.position.x,9,clown.position.z);}
    const occupiedLabels=[...document.querySelectorAll('header,aside,footer,#drawer:not([hidden]),#map')].filter(el=>el.offsetWidth).map(el=>el.getBoundingClientRect());
    const overlaps=(a,b)=>a.left<b.right+4&&a.right+4>b.left&&a.top<b.bottom+4&&a.bottom+4>b.top;
    const zoomed=distance<(mobile?160:150);
    for(const l of labels){
      const p=l.p.clone().project(camera),px=(p.x*.5+.5)*innerWidth,py=(-p.y*.5+.5)*innerHeight;
      if(p.z>1||p.z<0||px<0||px>innerWidth||l.house&&!zoomed&&(mobile||world?.households.length>30)){l.el.style.display='none';continue;}
      l.el.style.display='block';const width=l.el.offsetWidth,height=l.el.offsetHeight,left=Math.max(6,Math.min(innerWidth-width-6,px));
      const box=[0,-22,22,-44,44].map(dy=>({left,right:left+width,top:py+dy,bottom:py+dy+height})).find(b=>b.top>=6&&b.bottom<=innerHeight-6&&!occupiedLabels.some(other=>overlaps(b,other)));
      if(!box){l.el.style.display='none';continue;}
      l.el.style.left=box.left+'px';l.el.style.top=box.top+'px';occupiedLabels.push(box);
    }
    const ctx=$('map').getContext('2d');ctx.clearRect(0,0,210,150);ctx.strokeStyle='#beaf8c';ctx.strokeRect(10,10,190,130);for(const h of homes.values()){ctx.fillStyle='#77956d';ctx.fillRect((h.x+80)/160*210,(h.z+70)/140*150,4,4);}for(const p of pool)if(p.m.visible){ctx.fillStyle='#c68b54';ctx.fillRect((p.m.position.x+80)/160*210,(p.m.position.z+70)/140*150,3,3);}ctx.strokeStyle='#405c58';ctx.beginPath();ctx.moveTo(105,75);ctx.lineTo(85,50);ctx.lineTo(125,50);ctx.closePath();ctx.stroke();renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
