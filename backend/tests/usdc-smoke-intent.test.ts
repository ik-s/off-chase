import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { reserveSmokeIntent, saveSmokeIntent } from '../src/blockchain/usdcSmokeIntent.ts';

test('reserves a transfer intent once so a failed verification cannot send again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usdc-intent-'));
  const path = join(directory, 'intent.json');
  const intent = { chainId: 11155111, amountBaseUnits: '1000000', status: 'PENDING' as const };
  try {
    await reserveSmokeIntent(path, intent);
    await assert.rejects(reserveSmokeIntent(path, intent), { code: 'EEXIST' });
    await saveSmokeIntent(path, { ...intent, status: 'BROADCAST', transactionHash: `0x${'a'.repeat(64)}` });
    assert.equal(JSON.parse(await readFile(path, 'utf8')).transactionHash, `0x${'a'.repeat(64)}`);
    await assert.rejects(reserveSmokeIntent(path, intent), { code: 'EEXIST' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
