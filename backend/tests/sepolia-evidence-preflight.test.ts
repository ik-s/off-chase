import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('evidence smoke rejects a wallet labelled for mainnet before any RPC or signing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evidence-preflight-'));
  try {
    const walletPath = join(directory, 'wallet.json');
    writeFileSync(walletPath, JSON.stringify({
      chainId: 1,
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      privateKey: `0x${'0'.repeat(63)}1`,
    }));
    const result = spawnSync(process.execPath, ['scripts/sepolia-evidence-smoke.ts'], {
      cwd: new URL('..', import.meta.url),
      env: {
        RPC_URL: 'http://127.0.0.1:1', SMOKE_WALLET_PATH: walletPath,
        ANCHOR_CONTRACT_ADDRESS: '0x1111111111111111111111111111111111111111',
        SMOKE_EVIDENCE_DIR: join(directory, 'output'),
        SMOKE_RECIPIENT: '0x3333333333333333333333333333333333333333',
      }, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INVALID_SMOKE_WALLET/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
