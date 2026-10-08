'use strict';
// 送信：把寄出日早於今天（台北日曆日）的信，從 letters/pending 移到 letters/delivered，並記下送達日。
// 用法：node scripts/deliver_letters.js [--today YYYY-MM-DD] [--root <repo>] [--dry-run]
// 沒有伺服器，也不用 Actions：由維護者每天跑一次。做不到準點，只保證「隔一個日曆日以後」才到。
const fs = require('node:fs');
const path = require('node:path');
const {taipeiToday} = require('./check_members');
function deliver(base, today = taipeiToday(), {dryRun = false} = {}) {
 const pending = path.join(base, 'letters', 'pending'), delivered = path.join(base, 'letters', 'delivered');
 const moved = [], kept = [];
 if (!fs.existsSync(pending)) return {moved, kept};
 for (const file of fs.readdirSync(pending).filter(f => f.endsWith('.json')).sort()) {
   const letter = JSON.parse(fs.readFileSync(path.join(pending, file), 'utf8'));
   if (!(typeof letter.date === 'string' && letter.date < today)) { kept.push(file); continue; }
   moved.push(file);
   if (dryRun) continue;
   fs.mkdirSync(delivered, {recursive: true});
   if (fs.existsSync(path.join(delivered, file))) throw new Error('已送資料夾裡已經有 ' + file);
   fs.renameSync(path.join(pending,file),path.join(delivered,file));
   fs.writeFileSync(path.join(delivered, file), JSON.stringify({...letter, delivered_on: today}, null, 2) + '\n');
 }
 return {moved, kept};
}
if (require.main === module) {
 const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
 const today = opt('--today') || taipeiToday();
 if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) { console.error('--today 須為 YYYY-MM-DD'); process.exit(2); }
 const {moved, kept} = deliver(opt('--root') ? path.resolve(opt('--root')) : path.resolve(__dirname, '..'), today, {dryRun: args.includes('--dry-run')});
 for (const f of moved) console.log((args.includes('--dry-run') ? '會送出｜' : '已送出｜') + f);
 console.log('今天（' + today + '）送出 ' + moved.length + ' 封；還在路上 ' + kept.length + ' 封。接著跑 node scripts/build_site.js。');
}
module.exports = {deliver};
