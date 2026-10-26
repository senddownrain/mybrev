/* global Request */
/**
 * Real local HTTP endpoint (R02 fallback while there is no Cloudflare staging): the SAME worker/src/index.mjs behind node:http,
 * D1 replaced by a persistent SQLite file. Binds 127.0.0.1 only. Prints nothing about requests.
 *   INGEST_ENABLED=true REPORT_TOKEN=... ADMIN_TOKEN=... node worker/local-server.mjs [--port 8788] [--db path.sqlite]
 */
import http from 'node:http';
import { Readable } from 'node:stream';
import worker from './src/index.mjs';
import { createSqliteD1 } from './src/sqlite-d1-shim.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', process.env.PORT || 8788));
const DB = createSqliteD1({ file: arg('db', process.env.LOCAL_DB || ':memory:') });
const env = {
  DB,
  INGEST_ENABLED: process.env.INGEST_ENABLED ?? 'false',
  REPORT_TOKEN: process.env.REPORT_TOKEN, ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? '', DAILY_ROW_WRITE_BUDGET: process.env.DAILY_ROW_WRITE_BUDGET,
  RETENTION_DAYS: process.env.RETENTION_DAYS, MAX_DAY_AGE_DAYS: process.env.MAX_DAY_AGE_DAYS,
};

const server = http.createServer(async (req, res) => {
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`analytics staging local fallback listening on 127.0.0.1:${port}\n`));
process.on('SIGTERM', () => { server.close(); DB.close(); });
