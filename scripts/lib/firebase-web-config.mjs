export function validateFirebaseWebConfig(env) {
  const required = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];
  const missing = required.map((key) => `VITE_FIREBASE_${key}`)
    .filter((key) => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) {
    throw new Error(`Missing Firebase web build configuration: ${missing.join(', ')}. Supply VITE_FIREBASE_* before building; Hosting credentials do not configure the web client.`);
  }
}
