const {mkTmp,safeRm}=require('./_tmp');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {checkMember,safeSvg}=require('../scripts/check_members');
const good={type:'person',handle:'範例',avatar:1,intro:'一起做作品',owner_consent:true};
for(const f of fs.readdirSync(path.join(__dirname,'../members'))) test('範例通過：'+f,()=>{
 assert.equal(checkMember(JSON.parse(fs.readFileSync(path.join(__dirname,'../members',f),'utf8'))).filter(i=>i.fatal).length,0);
});
test('假電話與假金鑰皆失敗；CLI 非零',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/bad/example-bad.json'),'utf8'));
 const issues=checkMember(m);
 assert.ok(issues.some(i=>i.kind==='台灣手機'&&i.fatal));
 assert.ok(issues.some(i=>i.kind==='金鑰'&&i.fatal));
 assert.equal(cp.spawnSync(process.execPath,[path.join(__dirname,'../scripts/check_members.js'),path.join(__dirname,'fixtures/bad')]).status,1);
});
test('SVG script、事件、外連、超長均擋下',()=>{
 for(const svg of ['<svg><script>alert(1)</script></svg>','<svg onload="x"></svg>','<svg><use href="//example.invalid/x"/></svg>','<svg>'+ ' '.repeat(4096)+'</svg>'])
   assert.ok(checkMember({...good,custom_svg:svg}).some(i=>i.fatal));
 assert.ok(safeSvg('<svg><circle r="1"/></svg>'));
});
test('公司必填、作品數量、同意不能省略',()=>{
 for(const m of [{...good,type:'company'},{...good,owner_consent:false},{...good,avatar:13},{...good,type:'company',company:{what:'圖卡',works:Array(4).fill({title:'圖',description:'範例'})}}])
   assert.ok(checkMember(m).some(i=>i.fatal));
});
test('名片同意只豁免聯絡提醒，不豁免金鑰或其他欄',()=>{
 const issues=checkMember({...good,intro:'測試 test@example.invalid',card:{public_ok:true,contact:'test@example.invalid sk-FAKE_TEST_ONLY_000000'}});
 assert.ok(issues.some(i=>i.field==='intro'&&i.kind==='Email'));
 assert.ok(issues.some(i=>i.kind.includes('本人同意公開')));
 assert.ok(issues.some(i=>i.kind==='金鑰'&&i.fatal));
});
test('路徑與其他提醒辨識',()=>{
 const local=String.fromCharCode(67,58,92)+'private';
 assert.ok(checkMember({...good,intro:local}).some(i=>i.kind==='本機路徑'&&i.fatal));
 for(const [kind,value] of [['台灣市話','02-2000-0000'],['身分證格式','A100000000'],['統一編號','00000000'],['地址樣式','範例市範例區範例路一號'],['IPv4','192.0.2.1']])
   assert.ok(checkMember({...good,intro:value}).some(i=>i.kind===kind),kind);
});
