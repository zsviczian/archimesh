import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('health endpoint', () => {
  it('reports database connectivity', async () => {
    const app = await createApp(async () => {});
    try {
      const response = await app.inject('/api/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', database: 'connected' });
      const spec = (await app.inject('/api/openapi.json')).json();
      expect(spec.paths['/api/health'].get.responses['503']).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('returns 503 without leaking database errors', async () => {
    const app = await createApp(async () => {
      throw new Error('internal database details');
    });
    try {
      const response = await app.inject('/api/health');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: 'unavailable',
        database: 'unavailable',
      });
      expect(response.body).not.toContain('internal database details');
    } finally {
      await app.close();
    }
  });
});
