import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAllianceServer } from '../alliance/setup.js';
import { setupCoreServer, teardownServer } from './setup.js';
import {
  createTestServerContext,
  isolateFromDefaultContext,
  resolveTestConfig,
} from './server/tools/test-helpers.js';

describe('setup guards (CodeRabbit PR #150)', () => {
  afterEach(() => {
    teardownServer();
    isolateFromDefaultContext();
  });

  it('preserves injected client when setupAllianceServer receives context only', async () => {
    isolateFromDefaultContext();
    const mockClient = { query: vi.fn() };
    const ctx = createTestServerContext({ client: mockClient as never });

    await setupAllianceServer({ context: ctx });

    expect(ctx.getClient()).toBe(mockClient);
  });

  it('throws when setupCoreServer receives both config and context with injected client', async () => {
    isolateFromDefaultContext();
    const mockClient = { query: vi.fn() };
    const cfg = resolveTestConfig({ apiKey: 'guard-config-context' });
    const ctx = createTestServerContext({ config: cfg, client: mockClient as never });

    await expect(setupCoreServer({ config: cfg, context: ctx })).rejects.toThrow(
      /injected Pinecone client/
    );
    expect(ctx.getClient()).toBe(mockClient);
  });

  it('throws TypeError for invalid setupCoreServer options object', async () => {
    await expect(setupCoreServer({ foo: 'bar' } as never)).rejects.toThrow(
      /ServerConfig or SetupCoreServerOptions/
    );
  });

  it('throws TypeError for invalid setupAllianceServer options object', async () => {
    await expect(setupAllianceServer({ foo: 'bar' } as never)).rejects.toThrow(
      /ServerConfig or SetupAllianceServerOptions/
    );
  });
});
