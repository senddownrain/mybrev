import { reactive } from 'vue';

export const priestAccess = reactive({ active: false, checked: false, helpText: '', revision: 0 });
const base = '/api/priest';
const pendingKey = 'mybrev-priest-disable-pending'; // Non-secret intent; credential is HttpOnly.
const installationKey = 'mybrev-priest-installation-id'; // Random, non-secret browser-profile ID.
const messages = {
  INVALID_CODE: 'Код няправільны або ўжо заменены.',
  TOO_MANY_ATTEMPTS: 'Зашмат спробаў. Паспрабуйце праз 15 хвілін.',
  ACCESS_REQUIRED: 'Доступ адкліканы. Патрэбна новая актывацыя.',
  WEAK_CODE: 'Патрэбна 12–64 сімвалы A–Z і 2–9, не менш за 6 розных. Простыя паслядоўнасці забаронены.',
  INSTALLATION_REGISTERED: 'Гэта ўстаноўка ўжо зарэгістравана.',
  ADMIN_REQUIRED: 'Няма права кіраваць доступам для святароў.',
};
function pendingDisable() { return localStorage.getItem(pendingKey) === '1'; }
function changed(active) {
  priestAccess.active = active;
  priestAccess.checked = true;
  priestAccess.revision += 1;
}
export async function priestRequest(path, { method = 'GET', body, admin = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (admin) {
    const { getAuth } = await import('firebase/auth');
    const user = getAuth().currentUser;
    if (!user) throw new Error(messages.ADMIN_REQUIRED);
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) {
    const code = result.error?.code;
    if (!admin && code === 'ACCESS_REQUIRED') changed(false);
    const error = new Error(messages[code] || 'Не ўдалося выканаць дзеянне. Праверце злучэнне.');
    error.code = code;
    throw error;
  }
  return result;
}
let statusRequest;
export async function checkPriestAccess() {
  if (statusRequest) return statusRequest;
  statusRequest = (async () => {
    if (pendingDisable()) {
      await priestRequest('/disable', { method: 'POST', body: {} });
      localStorage.removeItem(pendingKey);
    }
    const result = await priestRequest('/status');
    const different = priestAccess.active !== result.active || !priestAccess.checked;
    if (different) changed(result.active);
    return result;
  })().catch((error) => {
    // Fail closed when offline; no protected disk cache is used.
    if (priestAccess.active || !priestAccess.checked) changed(false);
    throw error;
  }).finally(() => { statusRequest = null; });
  return statusRequest;
}
export async function activatePriestAccess(code, label) {
  if (pendingDisable()) await checkPriestAccess();
  let installationId = localStorage.getItem(installationKey);
  if (!installationId) { installationId = crypto.randomUUID(); localStorage.setItem(installationKey, installationId); }
  const body = {
    code, label, installationId, client: 'Web',
    deviceName: browserName(), platform: navigator.userAgentData?.platform || navigator.platform || '',
  };
  let result;
  try { result = await priestRequest('/activate', { method: 'POST', body }); }
  catch (error) {
    if (error.code !== 'INSTALLATION_REGISTERED') throw error;
    // Another tab may have just registered the profile. If its cookie is
    // available, keep that grant; after credential loss register a fresh ID.
    const status = await checkPriestAccess();
    if (status.active) return status;
    body.installationId = crypto.randomUUID();
    localStorage.setItem(installationKey, body.installationId);
    result = await priestRequest('/activate', { method: 'POST', body });
  }
  changed(result.active);
  return result;
}
function browserName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браўзер';
  return `${browser} · ${navigator.userAgentData?.platform || navigator.platform || 'Web'}`;
}
export async function disablePriestAccess() {
  localStorage.setItem(pendingKey, '1');
  changed(false);
  try {
    await priestRequest('/disable', { method: 'POST', body: {} });
    localStorage.removeItem(pendingKey);
  } catch { /* Keep intent until the next connection. Do not reuse the cookie. */ }
}
export async function loadPriestHelp() {
  try { priestAccess.helpText = (await priestRequest('/help')).helpText; } catch { /* No fictional contact. */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => checkPriestAccess().catch(() => {}));
  window.addEventListener('offline', () => changed(false));
  window.addEventListener('focus', () => checkPriestAccess().catch(() => {}));
  window.addEventListener('storage', (event) => { if (event.key === pendingKey) checkPriestAccess().catch(() => {}); });
  setInterval(() => { if (priestAccess.active) checkPriestAccess().catch(() => {}); }, 60000);
}
