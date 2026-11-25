import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const appChecks = new WeakMap();

class BoundedReCaptchaEnterpriseProvider extends ReCaptchaEnterpriseProvider {
  async getToken() {
    // The SDK waits for the Enterprise script. A blocked script must let SDK
    // requests proceed without attestation during the monitoring rollout.
    let timer;
    try {
      return await Promise.race([
        super.getToken(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('App Check attestation timed out')), 8000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function initializeClientAppCheck(app, siteKey) {
  const key = siteKey?.trim();
  if (!key) return undefined;

  const appCheck = initializeAppCheck(app, {
    provider: new BoundedReCaptchaEnterpriseProvider(key),
    isTokenAutoRefreshEnabled: true,
  });
  appChecks.set(app, appCheck);
  return appCheck;
}

export async function getClientAppCheckToken(app) {
  const appCheck = appChecks.get(app);
  if (!appCheck) return undefined;
  // Keep the feedback admin request available during monitoring if attestation fails.
  try {
    return (await getToken(appCheck)).token;
  } catch {
    return undefined;
  }
}
