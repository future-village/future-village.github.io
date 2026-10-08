const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mkTmp,safeRm}=require('./_tmp');
test('safeRm rejects non temporary and unregistered roots',()=>assert.throws(()=>safeRm(__dirname,'fixtures')));
test('safeRm refuses traversal and leaves target intact',()=>{const root=mkTmp('guard-');fs.writeFileSync(path.join(root,'keep'),'x');assert.throws(()=>safeRm(root,'../keep'));assert.ok(fs.existsSync(path.join(root,'keep')));});
test('safeRm rejects junctions and nested links before deleting anything',()=>{const root=mkTmp('guard-'),other=mkTmp('guard-');fs.mkdirSync(path.join(root,'tree'));fs.symlinkSync(other,path.join(root,'tree','link'),'junction');assert.throws(()=>safeRm(root,'tree'));assert.throws(()=>safeRm(root,'tree/link'));assert.ok(fs.existsSync(path.join(root,'tree')));});
test('safeRm removes only a registered temporary descendant',()=>{const root=mkTmp('guard-');fs.writeFileSync(path.join(root,'owned'),'x');safeRm(root,'owned');assert.equal(fs.existsSync(path.join(root,'owned')),false);});
