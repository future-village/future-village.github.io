import {worldPaths} from './paths.mjs';
import * as T from './assets/vendor/js/three/three.module.min.js';

export const GROUND_TOP_Y=0.3,OUTLINE_SCALE=1.015;
// Spring grass palette compensates for the warm scene light.
export const PALETTE={grass:[0x7fbd80,0x70ab70],grassHigh:0x94ce96,path:0xe5d2b0,pathJoint:0xd7c4a2,soil:0x9d9077,rock:0x948070,rockDark:0x7c6858,rockTip:0x645446,ink:0x2f464e};
// Near-white warm multiply. MeshBasic ignores the scene key so painted shade stays put.
export const GRASS_TILE_WORLD=12,PATH_TILE_WORLD=2.5,SURFACE_TINT=0xfff6ef;

let ramp;
export function toonRamp(){
  if(ramp)return ramp;
  const data=new Uint8Array([70,70,70,255,150,150,150,255,255,255,255,255]);
  const tex=new T.DataTexture(data,3,1,T.RGBAFormat);
  tex.minFilter=T.NearestFilter;tex.magFilter=T.NearestFilter;tex.wrapS=T.ClampToEdgeWrapping;tex.wrapT=T.ClampToEdgeWrapping;tex.generateMipmaps=false;
  if('NoColorSpace' in T)tex.colorSpace=T.NoColorSpace;else if('LinearSRGBColorSpace' in T)tex.colorSpace=T.LinearSRGBColorSpace;
  tex.needsUpdate=true;ramp=tex;return tex;
}

function loadTile(file){
  const src=worldPaths(import.meta.url).art('props/'+file.replace(/\.png$/, ''));
  const tex=typeof document==='undefined'?new T.Texture():new T.TextureLoader().load(src);
  tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(1,1);
  tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.anisotropy=4;tex.needsUpdate=true;tex.userData.src=src;
  return tex;
}
function painted(file){return new T.MeshBasicMaterial({map:loadTile(file),color:SURFACE_TINT,fog:true});}
function writeWorldUVs(geometry,tile,scaleX=1,scaleZ=1){
  const pos=geometry.attributes.position;
  let uv=geometry.attributes.uv;
  if(!uv||uv.count!==pos.count){uv=new T.BufferAttribute(new Float32Array(pos.count*2),2);geometry.setAttribute('uv',uv);}
  for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)*scaleX/tile,pos.getZ(i)*scaleZ/tile);
  uv.needsUpdate=true;
}

export function buildGround(scene){
  const materials=new Map(),box=new T.BoxGeometry(1,1,1),ball=new T.SphereGeometry(1,8,6);
  const ink=new T.MeshBasicMaterial({color:PALETTE.ink,side:T.BackSide,fog:true});
  const grassMat=painted('tile_grass.png'),pathMat=painted('tile_path_stone.png');
  function toon(color){if(!materials.has(color))materials.set(color,new T.MeshToonMaterial({color,gradientMap:toonRamp()}));return materials.get(color);}
  function add(geometry,color,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,toon(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
  function addPath(x,y,z,sx,sy,sz){
    const geo=box.clone();writeWorldUVs(geo,PATH_TILE_WORLD,sx,sz);
    const m=new T.Mesh(geo,pathMat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=false;m.receiveShadow=false;scene.add(m);return m;
  }
  function roundedRect(w,d,r){const s=new T.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function slab(w,d,r,color,bottom,height,z=8,surface){
    const g=new T.ExtrudeGeometry(roundedRect(w,d,r),{depth:height,bevelEnabled:false,curveSegments:8});g.rotateX(-Math.PI/2);
    let mesh;
    if(surface){writeWorldUVs(g,GRASS_TILE_WORLD);mesh=new T.Mesh(g,surface);mesh.position.set(0,bottom,z);mesh.castShadow=mesh.receiveShadow=false;scene.add(mesh);}
    else mesh=add(g,color,0,bottom,z);
    mesh.userData.role='slab';mesh.userData.bottom=bottom;mesh.userData.top=bottom+height;
    const shell=new T.Mesh(g,ink);shell.position.copy(mesh.position);shell.scale.set(OUTLINE_SCALE,OUTLINE_SCALE,OUTLINE_SCALE);shell.castShadow=shell.receiveShadow=false;shell.userData.role='shell';scene.add(shell);
    return mesh;
  }
  // Top footprint stays 181 x 175 so the existing plots still land on the cap. Side span is 0.3-(-44)=44.3, was 12.3.
  // Grass repeats about 181/12 by 175/12. Sides stay toon.
  slab(181,175,18,PALETTE.grass[0],GROUND_TOP_Y-.8,.8,8,grassMat);
  slab(176,170,16,PALETTE.soil,-8,7.5);
  slab(150,142,20,PALETTE.rock,-22,14);
  slab(96,88,22,PALETTE.rockDark,-36,14);
  slab(36,32,14,PALETTE.rockTip,-44,8);
  function bendLane(name,x0,z0,x1,z1,width,bow,y=.39){
    const dx=x1-x0,dz=z1-z0,len=Math.hypot(dx,dz)||1,steps=Math.max(4,Math.round(len/8)),px=-dz/len,pz=dx/len;
    for(let i=0;i<steps;i++){
      const t0=i/steps,t1=(i+1)/steps,arch=t=>Math.sin(t*Math.PI)*bow;
      const ax=x0+dx*t0+px*arch(t0),az=z0+dz*t0+pz*arch(t0),bx=x0+dx*t1+px*arch(t1),bz=z0+dz*t1+pz*arch(t1);
      const seg=Math.hypot(bx-ax,bz-az)+.45,m=addPath((ax+bx)/2,y,(az+bz)/2,width,.16,seg);
      m.rotation.y=Math.atan2(bx-ax,bz-az);m.userData.role='lane';m.userData.lane=name;
    }
  }
  // Bow stays inside the hummock clear bands (8 units, half road width 2.5).
  bendLane('south',-72,-58,72,-58,5,4);
  bendLane('north',-72,58,72,58,5,-3.5);
  bendLane('west',-70,-60,-70,60,5,4);
  bendLane('east',70,-60,70,60,5,-4);
  bendLane('spine',0,-57,0,57,5,4);
  bendLane('spur',0,58,0,87,4.5,2.2);
  add(ball,PALETTE.path,-43,.37,-38,13,.18,9);
  const water=add(new T.CircleGeometry(1,40),0x6dadae,-43,.61,-38,11,7.2,1);water.rotation.x=-Math.PI/2;water.castShadow=false;
  for(let i=0;i<15;i++){const angle=i*Math.PI*2/15;add(ball,i%2?PALETTE.rock:PALETTE.pathJoint,-43+Math.cos(angle)*12,.8,-38+Math.sin(angle)*8,1.1,.6,.9);}
  for(let i=0;i<11;i++)add(box,0xc49a67,-50+i*1.4,1.25,-38,1.3,.4,4);
  for(const [x,y,z,s] of [[78,-14,20,4.2],[-70,-18,55,3.4],[40,-20,-62,3.8],[-82,-12,-10,4.6],[18,-24,78,3.2],[-30,-16,-74,4],[86,-22,40,2.8],[-55,-26,70,3.6]]){const rock=add(ball,PALETTE.rock,x,y,z,s,s*.75,s*.9);rock.rotation.y=x+z;}
  for(const [x,y,z,s] of [[-8,-47,4,3.2],[7,-49,12,2.6],[2,-46,0,2.2],[-4,-50,16,3],[11,-45,8,2.4]])add(ball,PALETTE.rock,x,y,z,s,s*.72,s*.86);
}

export function eveningSky(){
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=256;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#606b95');gradient.addColorStop(.52,'#b392a3');gradient.addColorStop(1,'#edc4a2');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,2,256);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
