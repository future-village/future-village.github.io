const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mkTmp}=require('./_tmp'),{intakeEvent}=require('../scripts/intake_from_event'),{safeSvg,materialSvgIssues,checkRepo}=require('../scripts/check_members');
test('demo check-in preserves both standard SVG namespaces and AI material attribution',()=>{
 const body=fs.readFileSync(path.join(__dirname,'fixtures/demo-check-in.md'),'utf8');
 const base=mkTmp('launch-demo-'),event={action:'created',sender:{login:'demo-resident'},discussion:{user:{login:'demo-resident',id:101},category:{slug:'check-in'},body}};
 const result=intakeEvent(event,base);assert.equal(result.ok,true);assert.deepEqual(result.warnings,[]);
 const member=JSON.parse(fs.readFileSync(path.join(base,'members/demo-resident.json')));
 assert.equal(member.demo,true);assert.equal(member.authorized_by,'隊長');assert.equal(member.custom_svg,undefined);
 const room=JSON.parse(fs.readFileSync(path.join(base,'rooms/demo-resident/room.json')));assert.equal(room.slots.filter(s=>s.type==='own').length,2);assert.equal(checkRepo(base).n,0);
 assert.equal(JSON.parse(fs.readFileSync(path.join(base,'materials/demo-resident/item-2.json'))).made_by,'ai_assisted');
 const svg=fs.readFileSync(path.join(base,'materials/demo-resident/item-1.svg'),'utf8');
 assert.deepEqual(materialSvgIssues(svg),[]);assert.ok(materialSvgIssues(svg.replace('http://www.w3.org/2000/svg','https://example.invalid/svg')).length);
 assert.equal(JSON.parse(fs.readFileSync(path.join(base,'materials/demo-resident/item-1.json'))).made_by,'ai_marked');
 assert.deepEqual(checkRepo(base).issues.filter(i=>i.fatal),[]);
});
