'use strict';
// Durable Discussions are the queue. A version claim prevents replay after a crash.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const {gate}=require('./intake_gate');
function run(command,argv,cwd=process.cwd()){
 const r=cp.spawnSync(command,argv,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});
 if(r.status!==0)throw new Error(command+' failed: '+r.stderr);return r.stdout.trim();
}
function gh(argv){return run('gh',argv);}
function graphql(query,vars={}){return JSON.parse(gh(['api','graphql','-f','query='+query,...Object.entries(vars).flatMap(([k,v])=>['-f',k+'='+v])])).data;}
function signature(d){return crypto.createHash('sha256').update(JSON.stringify([d.author.databaseId,d.author.login,d.body,d.lastEditedAt,d.editor?.login||null])).digest('hex');}
function eventOf(d){return {action:'edited',sender:{login:d.editor?.login||d.author.login},discussion:{user:{login:d.author.login,id:d.author.databaseId},category:d.category,body:d.body}};}
async function sweep(listPage,hasReceipt,receive,{limit=25}={}){
 let cursor=null;const results=[];
 do {const page=await listPage(cursor);
  for(const d of page.nodes){if(d.category?.slug!=='check-in'||!d.author?.login)continue;
   if(d.lastEditedAt&&(!d.editor?.login||d.editor.login.toLowerCase()!==d.author.login.toLowerCase())){results.push({number:d.number,skipped:'non-author edit'});continue;}
   const mark='<!-- future-village-intake:'+signature(d)+' -->';
   if(await hasReceipt(d,mark))continue;
   if(results.length>=limit)return results;
   try{results.push({number:d.number,...await receive(d,mark)});}catch(e){results.push({number:d.number,error:e.message});}
  }
  cursor=page.pageInfo.hasNextPage?page.pageInfo.endCursor:null;
 }while(cursor);return results;
}
function receive(d,mark,prs){
 const e=eventOf(d),login=d.author.login;
 const comment=body=>graphql('mutation($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{id}}}',{id:d.id,body});
 const user=JSON.parse(gh(['api','users/'+login])),g=gate(user,prs,e);
 if(!g.ok){const created=Date.parse(user.created_at),retryAt=Number.isFinite(created)&&created+7*86400000>Date.now()?created+7*86400000:Date.now()+15*60000;comment('排隊中｜'+g.message+'\n<!-- future-village-queue:'+signature(d)+':'+retryAt+' -->');return {queued:true};}
 // Claim this exact version before any deterministic processing. A crash or network
 // failure after the claim requires maintainer review, never an automatic replay.
 comment('此貼文版本已開始代收；若沒有完成收據，請管理員檢查。\n'+mark);
 try {
 // A new worktree for every post, always based on the latest main, never old intake code.
 run('git',['fetch','origin','main']);
 const base=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'village-intake-'));
 run('git',['worktree','add','--detach',base,'origin/main']);
 const eventFile=path.join(base,'intake-event.json');fs.writeFileSync(eventFile,JSON.stringify(e));
 const received=cp.spawnSync(process.execPath,['scripts/intake_from_event.js',eventFile],{cwd:base,encoding:'utf8'});
 if(![0,1].includes(received.status))throw new Error('Intake execution failed');
 const result=JSON.parse(received.stdout);
 if(!result.ok){comment('失敗｜'+result.errors.join('\n失敗｜')+'\n'+mark);return {rejected:true};}
 run(process.execPath,['scripts/check_members.js'],base);
 const branch=result.branch;
 const remote=run('git',['ls-remote','origin','refs/heads/'+branch]).split(/\s/)[0];
 run('git',['add','members','rooms','materials'],base);
 const changed=run('git',['diff','--cached','--name-only'],base);
 if(changed){
  run('git',['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','Receive check-in'],base);
  run('git',['push','--force-with-lease=refs/heads/'+branch+':'+remote,'origin','HEAD:refs/heads/'+branch],base);
  const bodyFile=path.join(base,'intake-pr-body.txt');fs.writeFileSync(bodyFile,'Automatically received; maintainer review required.\nDetected kinds: '+(result.kinds||[]).join(', '));
  let pr=gh(['pr','list','--head',branch,'--base','main','--state','open','--json','url','--jq','.[0].url // empty']);
  if(!pr)pr=gh(['pr','create','--base','main','--head',branch,'--title','Check-in: '+result.slug,'--body-file',bodyFile]);
  else gh(['pr','edit',pr,'--body-file',bodyFile]);
  if(!prs.some(p=>p.headRefName===branch))prs.push({headRefName:branch});
  comment('PR: '+pr+'\n'+result.warnings.map(w=>'失敗｜'+w).join('\n')+'\n'+mark);
 }else comment('Check-in already matches main.\n'+mark);
 return {ok:true};
 }catch{
  comment('失敗｜代收處理或資料閘失敗，請管理員檢查；同一貼文版本只試一次。編輯貼文後才重新代收。\n'+mark);
  return {rejected:true,internal:true};
 }
}
async function main(){
 const [owner,name]=process.env.GITHUB_REPOSITORY.split('/');
 const prs=JSON.parse(gh(['pr','list','--base','main','--state','open','--limit','1000','--json','headRefName']));
 const list=cursor=>graphql('query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){discussions(first:100,after:$cursor){nodes{id number body author{login ... on User{databaseId}} editor{login} lastEditedAt category{slug}} pageInfo{hasNextPage endCursor}}}}',{owner,name,...(cursor?{cursor}:{})}).repository.discussions;
 const receipt=(d,mark)=>{let cursor=null;do{const page=graphql('query($id:ID!,$cursor:String){node(id:$id){... on Discussion{comments(first:100,after:$cursor){nodes{body author{login}} pageInfo{hasNextPage endCursor}}}}}',{id:d.id,...(cursor?{cursor}:{})}).node.comments;if(page.nodes.some(c=>receiptMatches(c,d,mark)))return true;cursor=page.pageInfo.hasNextPage?page.pageInfo.endCursor:null;}while(cursor);return false;};
 const results=await sweep(list,receipt,(d,mark)=>receive(d,mark,prs));console.log(JSON.stringify(results));if(results.some(r=>r.error))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
function receiptMatches(c,d,mark,now=Date.now()){
 if(c.author?.login!=='github-actions[bot]')return false;
 if(c.body.includes(mark))return true;
 return [...c.body.matchAll(/<!-- future-village-queue:([a-f0-9]{64}):(\d+) -->/g)].some(([,sig,expiry])=>sig===signature(d)&&Number(expiry)>now);
}
module.exports={sweep,signature,eventOf,receive,receiptMatches};
