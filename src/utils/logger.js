/**
 * Logger utility.
 * - In development: all levels are logged to the console.
 * - In production: only errors are logged, and they are also sent to Sentry.
 */

import * as Sentry from '@sentry/vue';

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args) => {
    if (isDev) console.log(...args);
  },

  warn: (...args) => {
    if (isDev) console.warn(...args);
  },

  /**
   * Always logged. In production, also reported to Sentry.
   * @param {...unknown} args
   */
  error: (...args) => {
    console.error(...args);

    if (!isDev) {
      const [message, ...rest] = args;
      const err = rest.find(a => a instanceof Error);
      if (err) {
        Sentry.captureException(err, { extra: { message } });
      } else {
        Sentry.captureMessage(String(message), { level: 'error', extra: { details: rest } });
      }
    }
  },

  info: (...args) => {
    if (isDev) console.info(...args);
  },

  debug: (...args) => {
    if (isDev) console.debug(...args);
  },

  group: (...args) => {
    if (isDev) console.group(...args);
  },

  groupEnd: () => {
    if (isDev) console.groupEnd();
  },

  groupCollapsed: (...args) => {
    if (isDev) console.groupCollapsed(...args);
  },
};
