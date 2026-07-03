import { environment } from '../../environments/environment';

const isDebug = !!(environment as any).debug;

export const logger = {
  trace: isDebug
    ? (...args: unknown[]) => console.log('[TRACE]', ...args)
    : () => {},
  info: isDebug
    ? (...args: unknown[]) => console.log('[Trailroam]', ...args)
    : () => {},
  gpx: isDebug
    ? (...args: unknown[]) => console.log('[GPX]', ...args)
    : () => {},
  error: (...args: unknown[]) => console.error('[Trailroam]', ...args),
  warn: (...args: unknown[]) => {
    if (isDebug) console.warn('[Trailroam]', ...args);
  },
};
