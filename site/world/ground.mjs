import * as T from './assets/vendor/js/three/three.module.min.js';

// Deterministic scenery: refreshing village data never changes the landscape.
export function buildGround(scene) {
  const materials=new Map(),box=new T.BoxGeometry(1,1,1),ball=new T.SphereGeometry(1,8,6);
  const material=color=>{if(!materials.has(color))materials.set(color,new T.MeshLambertMaterial({color}));return materials.get(color);};
  function add(geometry,color,x,y,z,sx=1,sy=1,sz=1){const m=new T.Mesh(geometry,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;scene.add(m);return m;}
  function outline(w,d,r){const s=new T.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function slab(w,d,r,color,bottom,height,z=8){const g=new T.ExtrudeGeometry(outline(w,d,r),{depth:height,bevelEnabled:false,curveSegments:8});g.rotateX(-Math.PI/2);return add(g,color,0,bottom,z);}
  slab(165,158,24,0x626b74,-12,3);
  slab(176,168,20,0x89918b,-9,4);
  slab(180,174,18,0x896448,-5,2);
  slab(180,174,18,0xaa8056,-3,2.5);
  slab(181,175,18,0x779358,-.5,.8);
  // Broad, low grass hummocks make the top varied without a texture download.
  for(let i=0;i<48;i++){const x=-75+(i*37%150),z=-62+(i*53%145);if(Math.abs(x)<8||Math.abs(z-58)<8||Math.abs(z+58)<8||Math.abs(x)>65)continue;add(ball,[0x809e5e,0x8baa69,0x6e8b51][i%3],x,.3,z,5+i%4,.12,4+i%5);}
  // Dirt lanes connect the roadside plots to all public buildings and village gate.
  for(const [x,z,w,d] of [[0,-58,145,5],[0,58,145,5],[-70,0,5,120],[70,0,5,120],[0,0,5,114],[0,73,5,29]])add(box,0xb69a70,x,.39,z,w,.16,d);
  for(let i=0;i<84;i++){const side=i%2?1:-1,x=i<42?-68+(i%42)*3.3:side*70,z=i<42?side*58:-53+(i%42)*2.6;const stone=add(ball,i%3?0xc6b99b:0x989f8d,x,.54,z,.7,.16,.55);stone.rotation.y=i;}
  // Central flagstone walk links the gate, post office and public square.
  for(let i=0;i<36;i++)for(let col=0;col<2;col++)add(box,(i+col)%3?0xc9c1a9:0xb0b4a3,-1.15+col*2.3,.51,-55+i*3.8,2.15,.2,3.55);
  // Paved square with staggered stone joints.
  for(let row=0;row<5;row++)for(let col=0;col<9;col++)add(box,(row+col)%3?0xc9c1a9:0xb0b4a3,-14+col*3.5+(row%2)*.6,.51,-65+row*3.5,3.3,.2,3.3);
  // Pond beside the square, with a wooden footbridge and bank stones.
  add(ball,0xc2bda1,-43,.37,-38,13,.18,9);
  const water=add(new T.CircleGeometry(1,40),0x6dadae,-43,.61,-38,11,7.2,1);water.rotation.x=-Math.PI/2;water.castShadow=false;
  for(let i=0;i<15;i++){const angle=i*Math.PI*2/15;add(ball,i%2?0x969e90:0xb6b6a2,-43+Math.cos(angle)*12,.8,-38+Math.sin(angle)*8,1.1,.6,.9);}
  for(let i=0;i<11;i++)add(box,0xc49a67,-50+i*1.4,1.25,-38,1.3,.4,4);
  for(const z of [-40,-36]){add(box,0x8f6d48,-43,3,z,16,.3,.3);for(const x of [-50,-43,-36])add(box,0x8f6d48,x,2,z,.35,2.4,.35);}
  // Low fences keep the main walking lanes open.
  for(const [cx,cz] of [[-56,72],[56,72],[-55,-70],[55,-70]]){for(let i=0;i<5;i++)add(box,0xd0b58a,cx-8+i*4,1.65,cz,.45,2.7,.45);for(const y of [1.1,2.2])add(box,0xc0a477,cx,y,cz,17,.3,.35);}
  for(let i=0;i<12;i++){const x=i%2?-79:79,z=-57+Math.floor(i/2)*24;add(ball,0x526f47,x,1,z,2.6,1.2,2.3);for(let j=0;j<4;j++)add(ball,[0xe9c075,0xd9908b,0xe7dccc][(i+j)%3],x-1.5+j,2,z+(j%2-.5),.45,.45,.45);}
  // Exposed rocks break up the island silhouette and emphasize its depth.
  for(let i=0;i<22;i++){const a=i*Math.PI*2/22;add(ball,i%2?0x727e7c:0x9a9f8e,Math.cos(a)*84,-6-(i%3),8+Math.sin(a)*80,3+i%3,2.5,3);}
}

export function eveningSky() {
  const canvas=document.createElement('canvas');canvas.width=2;canvas.height=256;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#606b95');gradient.addColorStop(.52,'#b392a3');gradient.addColorStop(1,'#edc4a2');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,2,256);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
