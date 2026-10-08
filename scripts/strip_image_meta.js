'use strict';
const fs=require('node:fs'),path=require('node:path');
function parts(buf,ext){
 const result=[];
 if(ext==='.png'){
  if(!buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG');
  result.push({type:'signature',bytes:buf.subarray(0,8)});
  let i=8;
  while(i<buf.length){if(i+12>buf.length)throw new Error('Truncated PNG');const n=buf.readUInt32BE(i),end=i+n+12;if(end>buf.length)throw new Error('Truncated PNG');result.push({type:buf.toString('ascii',i+4,i+8),bytes:buf.subarray(i,end)});i=end;}
 }else{
  if(buf[0]!==255||buf[1]!==216)throw new Error('Invalid JPEG');
  result.push({type:'SOI',bytes:buf.subarray(0,2)});let i=2;
  while(i<buf.length){
   const start=i;if(buf[i++]!==255)throw new Error('Invalid JPEG marker');while(buf[i]===255)i++;const m=buf[i++];if(m===undefined||m===0)throw new Error('Invalid JPEG marker');
   const type=m>=224&&m<=239?'APP'+(m-224):m===254?'COM':m===217?'EOI':m===218?'SOS':m.toString(16);
   if(m===217){result.push({type,bytes:buf.subarray(start,i)});if(i!==buf.length)throw new Error('Trailing JPEG data');break;}
   if(m!==1&&!(m>=208&&m<=215)){if(i+2>buf.length)throw new Error('Truncated JPEG');const n=buf.readUInt16BE(i);if(n<2||i+n>buf.length)throw new Error('Truncated JPEG');i+=n;}
   result.push({type,bytes:buf.subarray(start,i)});
   if(m===218){const scanStart=i;while(i<buf.length){if(buf[i]!==255){i++;continue;}let j=i+1;while(buf[j]===255)j++;if(buf[j]===0||(buf[j]>=208&&buf[j]<=215)){i=j+1;continue;}break;}result.push({type:'entropy',bytes:buf.subarray(scanStart,i)});}
  }
  if(result.at(-1).type!=='EOI')throw new Error('Missing JPEG end');
 }
 return result;
}
const metadata=type=>['tEXt','iTXt','zTXt','eXIf','COM'].includes(type)||/^APP(?:[1-9]|1[0-5])$/.test(type);
function strip(buf,ext){return Buffer.concat(parts(buf,ext).filter(p=>!metadata(p.type)).map(p=>p.bytes));}
if(require.main===module){const dir=path.resolve(process.argv[2]||path.join(__dirname,'../site/assets/art'));for(const name of fs.readdirSync(dir)){const ext=path.extname(name).toLowerCase();if(!['.png','.jpg','.jpeg'].includes(ext))continue;const file=path.join(dir,name),before=fs.readFileSync(file),after=strip(before,ext);fs.writeFileSync(file,after);console.log(JSON.stringify({name,beforeBytes:before.length,afterBytes:after.length,before:parts(before,ext).map(p=>p.type),after:parts(fs.readFileSync(file),ext).map(p=>p.type)}));}}
module.exports={parts,strip,metadata};
