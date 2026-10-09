'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {mkTmp}=require('./_tmp'),{fixture}=require('./_fixture'),{sweep,signature}=require('../scripts/intake_sweep'),{intakeEvent}=require('../scripts/intake_from_event'),{checkRepo,materialSvgIssues}=require('../scripts/check_members'),{scan}=require('../scripts/export_public');
const source=path.resolve(__dirname,'..'),body=fs.readFileSync(path.join(__dirname,'fixtures/intake/good-form.md'),'utf8').replace(/\r\n/g,'\n');
test('five concurrent check-ins survive coalesced event runs, pagination and retry',async()=>{
 const base=fixture(),posts=Array.from({length:5},(_,i)=>({number:i,id:'d'+i,author:{login:'resident-'+i,id:100+i,databaseId:100+i},body,category:{slug:'check-in'},editor:null,lastEditedAt:null})),receipts=new Set();
 const page=cursor=>({nodes:cursor?posts.slice(2):posts.slice(0,2),pageInfo:{hasNextPage:!cursor,endCursor:'next'}});
 let crash=true;
 const receive=(d,mark)=>{if(d.number===1&&crash){crash=false;throw new Error('transient failure');}const r=intakeEvent({action:'created',sender:d.author,discussion:{user:d.author,category:d.category,body:d.body}},base);assert.equal(r.ok,true);receipts.add(mark);return r;};
 const first=await sweep(page,(d,mark)=>receipts.has(mark),receive);assert.equal(first.filter(r=>r.error).length,1);
 assert.equal(checkRepo(base).n,4);await sweep(page,(d,mark)=>receipts.has(mark),receive);
 assert.equal(checkRepo(base).n,5);assert.equal(receipts.size,5);assert.deepEqual(checkRepo(base).issues.filter(i=>i.fatal),[]);
 assert.deepEqual(await sweep(page,(d,mark)=>receipts.has(mark),receive),[]);
 const edit={...posts[0],body:body+'\n',lastEditedAt:'2026-10-08',editor:posts[0].author};assert.notEqual(signature(edit),signature(posts[0]));
 assert.equal((await sweep(()=>({nodes:[{...edit,editor:{login:'impostor'}}],pageInfo:{hasNextPage:false}}),()=>false,receive))[0].skipped,'non-author edit');
});
test('tracked checkout with one real household still passes the entire suite',{skip:process.env.FV_AUDIT_CONSUMER==='1',timeout:120000},()=>{
 const base=mkTmp('audit-real-resident-');const files=cp.spawnSync('git',['-C',source,'ls-files','-z'],{encoding:'utf8'});assert.equal(files.status,0);
 for(const rel of require('./_fixture').publicTracked(source,files.stdout.split('\0').filter(Boolean))){const dest=path.join(base,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,rel),dest);}
 const git=argv=>{const r=cp.spawnSync('git',argv,{cwd:base,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git(['init']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@users.noreply.github.com','commit','-qm','Fixture']);
 const before=checkRepo(base).n;
 assert.equal(intakeEvent({action:'created',sender:{login:'real-resident'},discussion:{user:{login:'real-resident',id:101},category:{slug:'check-in'},body}},base).ok,true);git(['add','members','rooms','materials']);
 assert.equal(checkRepo(base).n,before+1);
 const r=cp.spawnSync(process.execPath,['--test'],{cwd:base,env:{...process.env,FV_AUDIT_CONSUMER:'1',FV_PAGES_CONSUMER:'1'},encoding:'utf8',timeout:100000,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
test('SVG encoded CSS and non-SVG namespaces rejected',()=>{for(const svg of ['<svg><rect fill="&#117;rl(x)"/></svg>','<svg><rect filter="'+String.fromCharCode(92)+'75 rl(x)"/></svg>','<svg xmlns="http://www.w3.org/1999/xhtml"></svg>'])assert.ok(materialSvgIssues(svg).length);});
test('oversized and pathological posts return promptly before writing',{timeout:2000},()=>{for(const body of ['\n'.repeat(65000),'a'.repeat(65000),'a'.repeat(19999)]){const base=mkTmp('audit-length-');const r=intakeEvent({action:'created',sender:{login:'resident'},discussion:{user:{login:'resident',id:101},category:{slug:'check-in'},body}},base);assert.equal(r.ok,false);assert.equal(fs.existsSync(path.join(base,'members')),false);}});
test('mail requires explicit author mark; missing flag fails',()=>{const base=fixture(),file=path.join(base,'letters/pending/example-person__example-company__2026-10-08.json'),letter=JSON.parse(fs.readFileSync(file));delete letter.ai_written;fs.writeFileSync(file,JSON.stringify(letter));assert.ok(checkRepo(base).issues.some(i=>i.field==='ai_written'&&i.fatal));});
test('export handles both slash directions and optional local rules',()=>{const base=mkTmp('audit-policy-'),file=path.join(base,'sample.md');fs.writeFileSync(file,['D:'+String.fromCharCode(92)+'private','D:'+String.fromCharCode(47)+'private'].join('\n'));assert.equal(scan(base,['sample.md']).hits.length,2);fs.writeFileSync(path.join(base,'.export-denylist.json'),JSON.stringify({rules:['LOCAL'+'_ONLY'],exclude:[]}));fs.writeFileSync(file,'LOCAL'+'_ONLY');assert.equal(scan(base,['sample.md']).hits.length,1);});
test('plot identity uses all 256 SHA bits and patrol text quotes untrusted content',()=>{const {plot}=require('../scripts/build_world'),{suggest}=require('../scripts/build_patrol');const crypto=require('node:crypto'),p=plot('resident'),digest=crypto.createHash('sha256').update('resident').digest('hex');assert.equal(BigInt(p.x).toString(16).padStart(32,'0')+BigInt(p.z).toString(16).padStart(32,'0'),digest);const result=suggest({households:[{id:'a',handle:'Quote"',missing:'地圖',moved_in_at:'2026-01-01'},{id:'b',handle:'B'}],events:[]},[{owner:'b',ref:'b/map',title:'地圖'}]);assert.ok(result.suggestions.every(s=>s.advisory_only&&s.requires_owner_consent));assert.ok(result.suggestions[0].text.includes(JSON.stringify('Quote"')));});

test('works survive personal and company check-in; malformed descriptions warn and omit only works',()=>{const {build}=require('../scripts/intake');for(const company of [false,true]){let post=body+'\n### 作品\n1. Map：A map. 2. Sketch：A sketch.\n';if(company)post=post.replace('個人＋AI','一人公司或公司＋AI').replace('### 一句話：我們做什麼（公司必填；個人留空）\n\n_No response_','### 一句話：我們做什麼（公司必填；個人留空）\n\nMake maps');const r=build(post,'resident'),m=r.files['members/resident.json'];assert.deepEqual(r.errors,[]);assert.equal((company?m.company.works:m.works).length,2);}assert.ok(build(body+'\n### 作品\nMissing description','resident').warnings.length);});

test('export control counts the public Chinese name',()=>{const base=mkTmp('audit-control-');fs.writeFileSync(path.join(base,'sample.md'),'未來村');assert.equal(scan(base,['sample.md']).control,1);});
