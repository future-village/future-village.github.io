const {mkTmp,safeRm}=require('./_tmp');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {build,intake,parsePost}=require('../scripts/intake');
const {checkRepo}=require('../scripts/check_members');
const root=path.join(__dirname,'..'),cli=path.join(root,'scripts/intake.js'),dir=path.join(__dirname,'fixtures/intake');
const post=name=>fs.readFileSync(path.join(dir,name+'.md'),'utf8');
function copy(){
 const tmp=require('./_fixture').fixture('intake-test-');
 return tmp;
}
test('表單貼法：轉成成員、房間、素材，寫進去後整個 repo 仍通過，N 加 1',()=>{
 const tmp=copy(),before=checkRepo(tmp).n;
 const r=intake(post('good-form'),'little-river',tmp);
 assert.deepEqual(r.errors,[]);
 const m=JSON.parse(fs.readFileSync(path.join(tmp,'members/little-river.json'),'utf8'));
 assert.equal(m.type,'person');assert.equal(m.avatar,4);assert.equal(m.owner_consent,true);
 const room=JSON.parse(fs.readFileSync(path.join(tmp,'rooms/little-river/room.json'),'utf8'));
 assert.equal(room.slots.length,6);
 assert.equal(room.missing,'想掛一件別人畫的小地圖');
 assert.deepEqual(room.slots[0],{type:'own',material:'little-river/item-1'});
 const meta=JSON.parse(fs.readFileSync(path.join(tmp,'materials/little-river/item-1.json'),'utf8'));
 assert.equal(meta.rights_ok,true);assert.equal(meta.desensitized_ok,true);assert.equal(meta.title,'河邊散步');
 const after=checkRepo(tmp);
 assert.deepEqual(after.issues.filter(i=>i.fatal),[]);
 assert.equal(after.n,before+1);
});
test('單行貼法：公司要有「做什麼」，30 秒必填就夠',()=>{
 const {files,errors}=build(post('good-simple'),'wood-shop');
 assert.deepEqual(errors,[]);
 const m=files['members/wood-shop.json'];
 assert.equal(m.type,'company');assert.equal(m.avatar,11);assert.equal(m.company.what,'把木作步驟畫成一張圖卡。');
 assert.equal(files['rooms/wood-shop/room.json'].missing,'想掛一件別人的配色表');
 assert.equal(Object.keys(files).some(f=>f.startsWith('materials/')),false);
 assert.equal(cp.spawnSync(process.execPath,[cli,path.join(dir,'good-simple.md'),'--slug','wood-shop','--root',copy()]).status,0);
});
for(const [name,want] of [['bad-script-svg','<script>'],['bad-link','外部連結'],['bad-no-consent','主人同意']])
 test('壞例擋下且不寫檔：'+name,()=>{
   const tmp=copy();
   const r=intake(post(name),'bad-one',tmp);
   assert.equal(r.ok,false);
   assert.ok(r.errors.some(e=>e.includes(want)),r.errors.join('\n'));
   assert.equal(fs.existsSync(path.join(tmp,'members/bad-one.json')),false);
   assert.equal(fs.existsSync(path.join(tmp,'rooms/bad-one')),false);
   assert.equal(cp.spawnSync(process.execPath,[cli,path.join(dir,name+'.md'),'--slug','bad-one','--root',tmp]).status,1);
 });
test('其他壞法：SVG 外連、自畫 SVG 含 script、缺必填、公司缺做什麼、素材沒勾權利',()=>{
 const good=post('good-form');
 const cases=[
   good.replace('<title>河邊散步</title>','<title>河邊散步</title><image href="https://example.invalid/a.png"/>'),
   good.replace('<title>河邊散步</title>','<script>x</script>'),
   good.replace('範例｜小河與阿藍','_No response_'),
   good.replace('個人＋AI','一人公司或公司＋AI'),
   good.replace('- [X] 素材一權利','- [ ] 素材一權利'),
   good.replace('虛構範例：一起把河邊的散步畫成小圖。','加我 line.me/ti/p/FAKE'),
 ];
 for(const text of cases)assert.equal(intake(text,'bad-two',copy()).ok,false,text.slice(0,80));
});
test('已有同名成員不覆蓋；slug 須為小寫',()=>{
 assert.equal(intake(post('good-form'),'example-person',copy()).ok,false);
 assert.ok(build(post('good-form'),'Bad Slug').errors.some(e=>e.includes('--slug')));
});
test('勾選框只認對應的勾：素材勾不能當主人同意',()=>{
 const {checks}=parsePost(post('bad-no-consent'));
 assert.equal(checks.consent,false);
 assert.equal(checks.rights_1,true);
});
