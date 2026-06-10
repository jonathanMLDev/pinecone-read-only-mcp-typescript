import { afterEach, describe, expect, it, vi } from 'vitest';
import { PineconeClient } from '../../pinecone-client.js';
import { resolveConfig } from '../../config.js';
import {
  getDefaultServerContext,
  setPineconeClient,
  setupCoreServer,
  teardownServer,
} from '../../index.js';
import { registerQueryTool } from './query-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  makeHybridQueryResult,
  parseToolJson,
  resolveTestConfig,
} from './test-helpers.js';

describe('tool handler lifecycle guards', () => {
  afterEach(() => {
    teardownServer();
  });

  it('returns LIFECYCLE when a stale handler invokes a disposed context', async () => {
    const ctx = createTestServerContext({
      client: { query: vi.fn() } as never,
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const handler = server.getHandler('query')!;

    ctx.teardown();

    const raw = await handler({
      query_text: 'contracts',
      namespace: 'wg21',
      preset: 'fast',
    });
    const err = assertToolErrorCode(raw, 'LIFECYCLE');
    expect(err.message).toContain('disposed');
  });

  it('fresh context after teardown produces a working handler', async () => {
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx1 = createTestServerContext({ client: { query } as never });
    const server1 = createMockServer();
    registerQueryTool(server1 as never, ctx1);
    ctx1.teardown();

    const ctx2 = createTestServerContext({
      config: { disableSuggestFlow: true },
      client: { query } as never,
    });
    const server2 = createMockServer();
    registerQueryTool(server2 as never, ctx2);

    const body = parseToolJson(
      await server2.getHandler('query')!({
        query_text: 'contracts',
        namespace: 'wg21',
        preset: 'fast',
      })
    );
    expect(body['status']).toBe('success');
  });

  it('setup cycle: teardownServer invalidates prior context handlers; re-setup works', async () => {
    const cfg = resolveConfig({ apiKey: 'lifecycle-cycle-key', indexName: 'test-index' });
    setPineconeClient(
      new PineconeClient({
        apiKey: cfg.apiKey,
        indexName: cfg.indexName,
        rerankModel: cfg.rerankModel,
        defaultTopK: cfg.defaultTopK,
      })
    );

    await setupCoreServer(cfg);
    const staleCtx = getDefaultServerContext();
    const mockServer = createMockServer();
    registerQueryTool(mockServer as never, staleCtx);
    const staleHandler = mockServer.getHandler('query')!;

    teardownServer();

    const staleRaw = await staleHandler({
      query_text: 'contracts',
      namespace: 'wg21',
      preset: 'fast',
    });
    assertToolErrorCode(staleRaw, 'LIFECYCLE');

    await expect(setupCoreServer(cfg)).resolves.toBeDefined();

    const freshCtx = createTestServerContext({
      config: resolveTestConfig({ disableSuggestFlow: true }),
      client: {
        query: vi.fn().mockResolvedValue(makeHybridQueryResult()),
      } as never,
    });
    const freshServer = createMockServer();
    registerQueryTool(freshServer as never, freshCtx);
    const body = parseToolJson(
      await freshServer.getHandler('query')!({
        query_text: 'contracts',
        namespace: 'wg21',
        preset: 'fast',
      })
    );
    expect(body['status']).toBe('success');

    teardownServer();
  });
});
