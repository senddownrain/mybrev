import fs from 'node:fs';
import { createCollector } from '/Users/gleb/Documents/GitHub/senddownrain/.worktrees-r06/web-int/src/utils/analytics/collector.js';
const inv = JSON.parse(fs.readFileSync('/Users/gleb/Documents/GitHub/senddownrain/.worktrees-r06/web-int/src/utils/analytics/public-inventory.json','utf8'));
const ids = new Set(inv.ids); const prayer = inv.ids.find(i=>i.startsWith('prayer:'));
const DAY=86400000; const t0 = Date.now()-DAY; const clock={t:t0};
const c = createCollector({platform:'web',appVersion:'4.5.2',enabled:true,publicIds:ids,now:()=>clock.t});
for(let i=0;i<7;i++){c.enterView({section:'prayers',contentId:prayer,totalChars:900,fits:true});clock.t+=20000;c.leaveView();}
for(let i=0;i<6;i++){c.enterView({catalogId:'songs'});clock.t+=6000;c.leaveView();}
for(let i=0;i<5;i++){c.featureUse('theme_change','prayers');}
c.flush();
const snap=c.snapshot(); fs.writeFileSync(process.argv[2],JSON.stringify(snap));
console.log(JSON.stringify({prayer, packets:snap.length, sumN:snap.flatMap(p=>p.cells).reduce((s,x)=>s+x.n,0), day:snap[0].day, cells:snap.flatMap(p=>p.cells).map(x=>JSON.stringify(x))}, null, 1));
