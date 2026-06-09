import { afterEach, describe, expect, it } from 'vitest';
import { PineconeClient } from '../pinecone-client.js';
import { resolveConfig } from '../config.js';
import { setPineconeClient } from '../server/client-context.js';
import { setupCoreServer, teardownServer } from '../setup.js';
import { resolveTestConfig } from './tools/test-helpers.js';
import { ServerContext, createServer, teardownDefaultServerContext } from './server-context.js';

describe('ServerContext lifecycle', () => {
  afterEach(() => {
    teardownServer();
  });

  it('sets disposed after teardown()', () => {
    const ctx = new ServerContext(resolveTestConfig());
    ctx.teardown();
    expect(ctx.disposed).toBe(true);
  });

  it('sets disposed after teardownDefaultServerContext()', () => {
    const ctx = createServer(resolveTestConfig());
    teardownDefaultServerContext();
    expect(ctx.disposed).toBe(true);
  });

  it('await using disposes ServerContext on scope exit', async () => {
    const config = resolveTestConfig();
    let ctx!: ServerContext;
    await (async () => {
      await using scoped = new ServerContext(config);
      ctx = scoped;
      expect(scoped.disposed).toBe(false);
    })();
    expect(ctx.disposed).toBe(true);
  });

  it('await using on setupCoreServer return value tears down and allows re-setup', async () => {
    const cfg = resolveConfig({ apiKey: 'lifecycle-await-key', indexName: 'test-index' });
    setPineconeClient(
      new PineconeClient({
        apiKey: cfg.apiKey,
        indexName: cfg.indexName,
        rerankModel: cfg.rerankModel,
        defaultTopK: cfg.defaultTopK,
      })
    );

    await (async () => {
      await using _server = await setupCoreServer(cfg);
    })();

    await expect(setupCoreServer(cfg)).resolves.toBeDefined();
    teardownServer();
  });
});
