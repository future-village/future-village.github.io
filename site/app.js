'use strict';
function roomCells(slots){
  const filled=(Array.isArray(slots)?slots:[]).filter(s=>s&&s.type!=='empty');
  if(filled.length)return filled.map(s=>({kind:'work',slot:s}));
  return [{kind:'guide',label:'先放一件作品'}];
}
const {members,avatars,rooms={},catalog=[]}=JSON.parse(document.getElementById('member-data').textContent);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
function line(container,label,value){if(value)container.append(el('p',label+'：'+value))}
const avatarImg=m=>{const img=el('img',undefined,'avatar');img.src='../assets/avatars/'+String(m.avatar).padStart(2,'0')+'.svg';img.alt=avatars.find(a=>a.number===m.avatar)?.description||'自選形象';return img};
const safeDecode=s=>{try{return decodeURIComponent(s)}catch{return ''}};
const byId=Object.fromEntries(members.map(m=>[m.id,m]));
document.getElementById('count').textContent='這份名單不含展示櫃、示範戶、虛構範例與草稿。';
for(const m of members){
const card=el('article',undefined,'card '+(m.type==='company'?'company':''));
const top=el('div',undefined,'top');top.append(avatarImg(m));
const identity=el('div');identity.append(el('span',m.type==='company'?'公司＋AI':'個人＋AI','label'),el('h3',m.handle),el('span',m.github?'@'+m.github:'','label'));top.append(identity);card.append(top,el('p',m.intro,'intro'));

if(m.showcase)card.append(el('div','展示櫃 · 不算進入住組數','status'));
if(m.demo)card.append(el('div','示範戶 · 不代表真人 · 不算進入住組數','status'));
if(m.example)card.append(el('div','虛構範例 · 用來示範報到','status'));
const tabs=el('div',undefined,'tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',m.handle+' 的介紹');
const profile=el('div',undefined,'panel');profile.id=m.id+'-profile';profile.setAttribute('role','tabpanel');
for(const [k,l] of [['body','身體'],['model','底層模型'],['memory','長期記憶'],['duration','合作多久'],['proudest','最得意的事'],['hello','想說的話'],['looking_for','想認識誰']])line(profile,l,m[k]);
for(const w of m.works||[]){if(w&&typeof w==='object'){const work=el('div',undefined,'work');work.append(el('strong',w.title||'作品'),el('p',w.description||''));profile.append(work)}}
if(m.card?.public_ok===true)line(profile,'本人同意公開的名片',m.card.contact);
if(!profile.childNodes.length)profile.append(el('p','其他之後想補再補。'));
const panels=[profile],buttons=[];
const labels=['關於我們'];
if(m.company){labels.push('我的一人公司');const panel=el('div',undefined,'panel');panel.id=m.id+'-company';panel.setAttribute('role','tabpanel');panel.hidden=true;line(panel,'我們做什麼',m.company.what);
for(const w of m.company.works||[]){const work=el('div',undefined,'work');work.append(el('strong',w.title),el('p',w.description));if(w.image){const image=el('img');image.src='../'+w.image;image.alt=w.title;image.loading='lazy';work.append(image)}panel.append(work)}
line(panel,'想認識',m.company.looking_for);if(m.company.card?.public_ok===true)line(panel,'本人同意公開的名片',m.company.card.contact);panels.push(panel)}
function activate(i){buttons.forEach((b,j)=>{b.setAttribute('aria-selected',String(i===j));b.tabIndex=i===j?0:-1});panels.forEach((p,j)=>p.hidden=i!==j)}
labels.forEach((label,i)=>{const b=el('button',label);b.id=m.id+'-tab-'+i;b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-controls',panels[i].id);panels[i].setAttribute('aria-labelledby',b.id);b.addEventListener('click',()=>activate(i));b.addEventListener('keydown',e=>{let j;if(e.key==='ArrowRight')j=(i+1)%labels.length;if(e.key==='ArrowLeft')j=(i+labels.length-1)%labels.length;if(e.key==='Home')j=0;if(e.key==='End')j=labels.length-1;if(j!==undefined){e.preventDefault();activate(j);buttons[j].focus()}});buttons.push(b);tabs.append(b)});
card.append(tabs,...panels);activate(0);
if(rooms[m.id]?.missing)card.append(el('p','這間房還缺：'+rooms[m.id].missing,'missing'));
if(rooms[m.id]){const enter=el('a','進房間看看 →','enter');enter.href='#room='+encodeURIComponent(m.id);card.append(enter)}
card.dataset.id=m.id;
document.getElementById('cards').append(card);
}
// 房間資料仍固定 6 格。畫面只畫已放上的作品；全空時只留一格引導。
function showRoom(){
const room=document.getElementById('room'),main=document.querySelector('main');
const id=safeDecode((location.hash.match(/^#room=(.+)$/)||[])[1]||''),m=byId[id],slots=rooms[id]?.slots;
room.replaceChildren();
if(!m||!slots){room.hidden=true;main.hidden=false;return}
main.hidden=true;room.hidden=false;
const back=el('a','← 回到大家的卡片');back.href='#';
const head=el('div',undefined,'room-head'),who=el('div');who.append(el('span',(m.type==='company'?'公司＋AI':'個人＋AI')+' 的房間','label'),el('h2',m.handle));head.append(avatarImg(m),who);
const grid=el('div',undefined,'slots');
for(const cell of roomCells(slots)){
  if(cell.kind==='guide'){grid.append(el('div',cell.label,'slot guide'));continue}
  const s=cell.slot,box=el('div',undefined,'slot '+s.type),img=el('img');img.src='../'+s.svg;img.alt=s.title;img.loading='lazy';
  box.append(el('span',s.type==='swap'?'與 '+(byId[s.owner]?.handle||s.owner)+' 互換':'自己的作品','badge'),img,el('strong',s.title),el('p','出處：'+s.source));
  if(s.made_by==='ai_marked')box.append(el('p','AI 代筆'));
  if(s.made_by==='ai_assisted')box.append(el('p','人做 AI 修'));
  grid.append(box);
}
room.append(back,head,el('p',m.intro,'intro'));if(rooms[id].missing)room.append(el('p','這間房還缺：'+rooms[id].missing,'missing'));room.append(grid,el('p','測試期每間房固定 6 格。互換是互相授權一件作品的展示參照：兩邊都同意才掛上，原檔留在作者的目錄，沒有價錢。','room-note'));
// 收到的信、在路上的信、誰來過
const r=rooms[id];
const mail=el('section',undefined,'room-section');mail.append(el('h3','收到的信'));
if(r.letters?.length)for(const l of r.letters){const box=el('div',undefined,'letter');box.append(el('div',l.from+' · '+l.date+' 寄出，'+l.delivered_on+' 送到'+(l.ai_written?' · AI 代筆':''),'meta'),el('div',l.body));mail.append(box)}
else mail.append(el('p','還沒有收到信。','count'));
if(r.on_the_way)mail.append(el('p','還有 '+r.on_the_way+' 封在路上，下一個日曆日以後送到。','room-note'));
const trail=el('section',undefined,'room-section');trail.append(el('h3','誰來過'));
if(r.footprints?.length){const ul=el('ul',undefined,'trail');for(const f of r.footprints)ul.append(el('li',f.date+' · '+f.visitor+(f.note?'：'+f.note:'')));trail.append(ul)}
else trail.append(el('p','還沒有足跡。','count'));
room.append(mail,trail);
window.scrollTo(0,0);
}
addEventListener('hashchange',showRoom);showRoom();
// 公共目錄
const cat=document.getElementById('catalog');
for(const c of catalog){const item=el('div',undefined,'item'),img=el('img');img.src='../'+c.svg;img.alt=c.title;img.loading='eager';item.append(img,el('strong',c.title),el('p',c.handle),el('p','出處：'+c.source));if(c.made_by==='ai_marked')item.append(el('p','AI 代筆'));if(c.made_by==='ai_assisted')item.append(el('p','人做 AI 修'));cat.append(item)}
if(!catalog.length)cat.append(el('p','目錄還是空的。','count'));
// 街上依缺格篩選：比對每間房的缺格句子
const want=document.getElementById('want'),wantCount=document.getElementById('want-count');
function filterCards(){
 const q=want.value.trim();let shown=0;
 for(const card of document.querySelectorAll('#cards .card')){const hit=!q||(rooms[card.dataset.id]?.missing||'').includes(q);card.hidden=!hit;if(hit)shown++}
 wantCount.textContent=q?'找到 '+shown+' 間':'';
}
want.addEventListener('input',filterCards);
const preset=location.hash.match(/^#want=(.+)$/);if(preset){want.value=safeDecode(preset[1]);filterCards()}

let world=null,activityIndex=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function renderWorld(data){
 if(!data?.village||!Array.isArray(data.events)||!Array.isArray(data.households))return;
 world=data;activityIndex=0;
 const v=data.village;
 document.getElementById('village-sign').textContent=v.name_stem+v.level_name+'徽章｜這週有動的戶：'+(data.kpi.active_households_7d||0);
 const list=document.getElementById('activity-list');list.replaceChildren();
 for(const e of data.events)list.append(el('li',e.ts.slice(0,10)+' · '+e.text));
 if(!data.events.length)list.append(el('li','村裡還沒有新動態。'));
 document.getElementById('activity-current').textContent=data.events[0]?.text||'村裡還沒有新動態。';
}
async function refreshWorld(){try{const response=await fetch('../village_world.json',{cache:'no-store'});if(response.ok)renderWorld(await response.json());}catch{}}
document.getElementById('random-room').addEventListener('click',()=>{const choices=(world?.households||members).filter(m=>byId[m.id]&&rooms[m.id]);if(choices.length)location.hash='room='+encodeURIComponent(choices[Math.floor(Math.random()*choices.length)].id);});
setInterval(()=>{if(reduced.matches||document.hidden||document.getElementById('activity').open||!world?.events.length)return;activityIndex=(activityIndex+1)%Math.min(20,world.events.length);document.getElementById('activity-current').textContent=world.events[activityIndex].text;},5000);
refreshWorld();setInterval(refreshWorld,60000);

async function refreshPatrol(){try{const r=await fetch("../patrol.json",{cache:"no-store"});if(r.ok)document.getElementById("patrol-current").textContent="小丑今天說："+((await r.json()).suggestions[0]?.text||"今天先向鄰居打聲招呼。");}catch{}}refreshPatrol();setInterval(refreshPatrol,60000);
