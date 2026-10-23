export const logger = {
  info: (msg: string, meta?: unknown) => {
    console.log(`[WORKER-INFO] ${new Date().toISOString()} - ${msg}`, meta !== undefined ? meta : '');
  },
  warn: (msg: string, meta?: unknown) => {
    console.warn(`[WORKER-WARN] ${new Date().toISOString()} - ${msg}`, meta !== undefined ? meta : '');
  },
  error: (msg: string, meta?: unknown) => {
    console.error(`[WORKER-ERROR] ${new Date().toISOString()} - ${msg}`, meta !== undefined ? meta : '');
  },
  debug: (msg: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[WORKER-DEBUG] ${new Date().toISOString()} - ${msg}`, meta !== undefined ? meta : '');
    }
  },
};
