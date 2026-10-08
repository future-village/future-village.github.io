'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {mkTmp}=require('./_tmp'),{exportPublic}=require('../scripts/export_public');
const source=path.resolve(__dirname,'..');
test('clean public checkout runs all five Pages steps without test artifacts',{
 skip:process.env.FV_PAGES_CONSUMER==='1',timeout:120000
},()=>{
 const root=path.join(mkTmp('pages-consumer-'),'checkout');
 assert.equal(exportPublic(root,source).ok,true);
 function run(command,argv,env=process.env){
  const result=cp.spawnSync(command,argv,{cwd:root,encoding:'utf8',env,timeout:100000,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.error?.message||result.stdout+'\n'+result.stderr);
 }
 run('git',['init']);run('git',['add','.']);
 run('git',['-c','user.name=zaxardery8011-design','-c','user.email=283511868+zaxardery8011-design@users.noreply.github.com','commit','-qm','Public checkout fixture']);
 const steps=[...fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8').matchAll(/^\s+- run: node (.+)$/gm)].map(m=>m[1].trim());
 assert.deepEqual(steps,['scripts/check_members.js','--test','scripts/build_site.js','scripts/build_world.js','scripts/build_patrol.js']);
 const before=fs.readdirSync(root).sort();
 for(let i=0;i<steps.length;i++){
  run(process.execPath,steps[i].split(' '),{...process.env,FV_PAGES_CONSUMER:'1'});
  if(i<2){assert.equal(fs.existsSync(path.join(root,'_site')),false);assert.deepEqual(fs.readdirSync(root).sort(),before);}
 }
 for(const rel of ['index.html','world/index.html','village_world.json','patrol.json'])assert.ok(fs.existsSync(path.join(root,'_site',rel)),rel);
 assert.equal(cp.spawnSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).stdout,'');
});
