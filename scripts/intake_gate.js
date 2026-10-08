'use strict';
const fs=require('node:fs');
function gate(user,prs,event,now=Date.now()) {
 const created=Date.parse(user.created_at);
 if(!Number.isFinite(created)||now-created<7*86400000)return {ok:false,message:'帳號建立未滿 7 天或建立時間無法確認，請滿 7 天後再報到；尚未開 PR。'};
 const login=event.discussion?.user?.login;
 if(typeof login!=='string')return {ok:false,message:'無法確認報到帳號。'};
 const branch='intake/'+login.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,39);
 const intake=prs.filter(p=>p.headRefName.startsWith('intake/'));
 if(intake.length>50&&!intake.some(p=>p.headRefName===branch))return {ok:false,message:'排隊中：開著的 intake PR 超過 50 條，暫不開新的 PR。'};
 return {ok:true,message:'可以代收'};
}
if(require.main===module){const [user,prs,event]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,'utf8')));const r=gate(user,prs,event);console.log(r.message);if(!r.ok)process.exitCode=1;}
module.exports={gate};
