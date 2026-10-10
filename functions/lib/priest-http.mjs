import { ApiError } from './priest-service.mjs';
import { parseCredential } from './priest-crypto.mjs';

const COOKIE = '__session'; // Firebase Hosting forwards this cookie to Functions.
export function createPriestHandler(service, { verifyAdmin, origins, insecureCookie = false }) {
  const cookie = (credential, clear = false) => `${COOKIE}=${clear ? '' : credential}; Path=/api/priest; HttpOnly; ${insecureCookie ? '' : 'Secure; '}SameSite=Strict; Max-Age=${clear ? 0 : 34560000}`;
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Vary', 'Cookie, Authorization, Origin');
    res.set('X-Content-Type-Options', 'nosniff');
    try {
      const origin = req.get('origin');
      if (origin && !origins.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED');
      if (origin) { res.set('Access-Control-Allow-Origin', origin); res.set('Access-Control-Allow-Credentials', 'true'); }
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Priest-Client');
        return res.status(204).send('');
      }
      const path = req.path.replace(/^\/api\/priest/, '') || '/';
      const bearer = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
      const cookieValue = (req.get('cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      const credential = parseCredential(bearer || cookieValue);
      const input = req.body || {};
      const native = req.get('x-priest-client') === 'Flutter';
      if (req.get('sec-fetch-site') === 'cross-site' && !origin) throw new ApiError(403, 'ORIGIN_DENIED');
      if (['POST', 'PATCH'].includes(req.method)) {
        if (!req.is('application/json') || Buffer.byteLength(JSON.stringify(input)) > 8192) throw new ApiError(400, 'INVALID_REQUEST');
        if (!origin && !native && !path.startsWith('/admin/')) throw new ApiError(403, 'ORIGIN_DENIED');
      }
      if (req.method === 'POST' && path === '/activate') {
        if ((native ? 'Flutter' : 'Web') !== input.client) throw new ApiError(400, 'INVALID_DEVICE');
        const result = await service.activate(input, req.ip || 'unknown');
        if (native) return res.json({ active: true, device: result.device, credential: result.credential });
        res.set('Set-Cookie', cookie(result.credential));
        return res.json({ active: true, device: result.device });
      }
      if (req.method === 'GET' && path === '/status') {
        const status = await service.status(credential);
        if (status.active && cookieValue && !bearer) res.set('Set-Cookie', cookie(cookieValue));
        return res.json(status);
      }
      if (req.method === 'POST' && path === '/disable') {
        await service.disable(credential);
        res.set('Set-Cookie', cookie('', true));
        return res.json({ active: false });
      }
      if (req.method === 'GET' && path === '/help') return res.json({ helpText: (await service.settings()).helpText });
      if (req.method === 'GET' && (path === '/content' || path === '/categories' || path === '/prayers' || path.startsWith('/prayers/'))) {
        const content = await service.content(credential, req.query.public === '1');
        if (path === '/content') return res.json(content);
        if (path === '/categories') return res.json({ categories: content.categories });
        if (path === '/prayers') {
          const query = String(req.query.q || '').toLocaleLowerCase();
          const ids = req.query.ids ? String(req.query.ids).split(',') : null;
          return res.json({ prayers: content.prayers.filter((p) => (!ids || ids.includes(p.id)) && (!query || JSON.stringify(p).toLocaleLowerCase().includes(query))) });
        }
        const id = decodeURIComponent(path.slice('/prayers/'.length));
        const prayer = content.prayers.find((p) => p.id === id);
        if (!prayer) throw new ApiError(404, 'NOT_FOUND');
        return res.json({ prayer });
      }
      if (path.startsWith('/admin/')) {
        const uid = await verifyAdmin(bearer);
        if (path === '/admin/settings' && req.method === 'GET') return res.json(await service.settings());
        if (path === '/admin/code' && req.method === 'POST') return res.json(await service.replaceCode(input, uid));
        if (path === '/admin/help' && req.method === 'PATCH') return res.json(await service.setHelp(input));
        if (path === '/admin/devices' && req.method === 'GET') return res.json(await service.listDevices(req.query));
        if (path.startsWith('/admin/devices/') && req.method === 'PATCH') return res.json(await service.updateDevice(path.slice('/admin/devices/'.length), input));
      }
      throw new ApiError(404, 'NOT_FOUND');
    } catch (error) {
      if (error.code === 'ACCESS_REQUIRED') res.set('Set-Cookie', cookie('', true));
      if (error.status === 429) res.set('Retry-After', '900');
      // Never include request bodies, bearer credentials, hashes or error internals.
      return res.status(error.status || 503).json({ error: { code: error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE' } });
    }
  };
}
