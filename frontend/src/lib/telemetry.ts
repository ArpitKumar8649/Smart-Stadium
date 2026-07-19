/**
 * Telemetry and logging utility for the frontend.
 *
 * Provides a standardized way to log errors and events, replacing bare
 * console calls. In production, this can be wired to a real telemetry
 * sink (e.g. Sentry, Datadog, or Firebase Crashlytics).
 */

const isDev = import.meta.env.MODE === 'development';

export const logger = {
  error: (message: string, error?: unknown) => {
    if (isDev) {
      // Keep console.error for local debugging
      console.error(message, error);
    } else {
      // In production, this would ship to an error tracking service
      // Example: Sentry.captureException(error);
    }
  },
  warn: (message: string, data?: unknown) => {
    if (isDev) {
      console.warn(message, data);
    }
  },
  info: (message: string, data?: unknown) => {
    if (isDev) {
      console.log(message, data);
    }
  },
};
