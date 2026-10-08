const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mkTmp}=require('./_tmp'),{checkBook,checkRepo}=require('../scripts/check_members'),{buildSite}=require('../scripts/build_site'),{scan}=require('../scripts/export_public');
const root=path.resolve(__dirname,'..');
test('book schema accepts a description and rejects unsafe or incomplete cards',()=>{
 const good={title:'Book',summary:'Description',source_url:'https://example.org/book',tags:['tools'],added_by:'example-person',made_by:'human',license:'CC BY 4.0',do_not_execute:true};
 assert.deepEqual(checkBook(good),[]);
 for(const key of Object.keys(good)){const bad={...good};delete bad[key];assert.ok(checkBook(bad).length,key);}
 for(const bad of [{source_url:'http://example.org'},{summary:'```js\nrun()\n```'},{summary:'C'+':'+String.fromCharCode(92)+'private'},{do_not_execute:false}])assert.ok(checkBook({...good,...bad}).length);
 const dir=mkTmp('s1-books-');fs.cpSync(root,dir,{recursive:true,filter:src=>!src.includes(path.sep+'.git')&&!src.includes(path.sep+'_site')});fs.writeFileSync(path.join(dir,'library','book.json'),JSON.stringify(good));assert.ok(!checkRepo(dir).issues.some(i=>i.fatal));fs.writeFileSync(path.join(dir,'library','book.json'),JSON.stringify({...good,license:''}));assert.ok(checkRepo(dir).issues.some(i=>i.file==='library/book.json'&&i.fatal));
});
test('deployment publishes machine layer and only consented source data',()=>{
 const out=path.join(mkTmp('s1-site-'),'site');buildSite(root,out);
 for(const rel of ['llms.txt','AGENTS.md','RULES.md','library/README.md','members/example-person.json','rooms/example-person/room.json'])assert.ok(fs.existsSync(path.join(out,rel)),rel);
 assert.equal(fs.existsSync(path.join(out,'members/aiwff-main-brain.json')),true);assert.equal(fs.readdirSync(path.join(out,'library')).filter(f=>f.endsWith('.json')).length,0);
});
test('export gate catches both placeholder forms',()=>{const dir=mkTmp('s1-gate-');fs.writeFileSync(path.join(dir,'sample.txt'),'[TB'+'D handle]\nTB'+'D: handle');assert.equal(scan(dir,['sample.txt']).hits.length,2);});
