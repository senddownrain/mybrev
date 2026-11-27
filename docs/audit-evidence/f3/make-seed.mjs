// F3 QA helper: prints a SYNTHETIC closed-day buffer (value for localStorage.analytics_local_v1) built by the real collector.
// Usage: node make-seed.mjs [daysAgo=1]   — synthetic QA data, not human behaviour.
import fs from 'node:fs';
import { createCollector } from '../../../src/utils/analytics/collector.js';

const inventory = JSON.parse(fs.readFileSync(new URL('../../../src/utils/analytics/public-inventory.json', import.meta.url), 'utf8'));
const prayer = inventory.ids.find((id) => id.startsWith('prayer:'));
const daysAgo = Number(process.argv[2] ?? 1);
const clock = { t: Date.now() - daysAgo * 86400000 };
const collector = createCollector({ platform: 'web', appVersion: '4.5.2', enabled: true, publicIds: new Set(inventory.ids), now: () => clock.t });
collector.enterView({ section: 'prayers', contentId: prayer, totalChars: 900, fits: true });
clock.t += 20000; collector.leaveView();
collector.enterView({ catalogId: 'songs' }); clock.t += 8000;
collector.featureUse('theme_change', 'prayers');
collector.enterView({ catalogId: 'favorites' }); clock.t += 5000;
collector.flush();
process.stdout.write(JSON.stringify(collector.snapshot()));
