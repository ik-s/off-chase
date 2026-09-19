import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('refuses a wallet file labelled for another chain before touching RPC', () => {
  const directory = mkdtempSync(join(tmpdir(), 'usdc-smoke-'));
  try {
    const walletPath = join(directory, 'wallet.json');
    writeFileSync(walletPath, JSON.stringify({
      chainId: 1,
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      privateKey: `0x${'0'.repeat(63)}1`,
    }));
    const result = spawnSync(process.execPath, ['scripts/sepolia-usdc-smoke.ts'], {
      cwd: new URL('..', import.meta.url),
      env: {
        RPC_URL: 'http://127.0.0.1:1', SMOKE_WALLET_PATH: walletPath,
        SMOKE_RECIPIENT: '0x3333333333333333333333333333333333333333',
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INVALID_SMOKE_WALLET/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
