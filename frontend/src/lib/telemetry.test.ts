import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './telemetry';

describe('telemetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('MODE', 'development');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not log errors in test mode', () => {
    logger.error('Test error', new Error('test'));
    expect(console.error).not.toHaveBeenCalled();
  });

  it('does not log warnings in test mode', () => {
    logger.warn('Test warn', { foo: 'bar' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('does not log info in test mode', () => {
    logger.info('Test info', { foo: 'bar' });
    expect(console.log).not.toHaveBeenCalled();
  });
});