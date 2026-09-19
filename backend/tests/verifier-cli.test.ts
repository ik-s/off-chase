import assert from 'node:assert/strict';
import test from 'node:test';
import { verifierConfig } from '../src/verification/cli.ts';

test('verifier CLI requires a bundle path and an independently configured chain', () => {
  const env = {
    RPC_URL: 'https://sepolia.example.invalid',
    CHAIN_ID: '11155111',
    ANCHOR_CONTRACT_ADDRESS: `0x${'1'.repeat(40)}`,
  };
  assert.deepEqual(verifierConfig(['bundle.json'], env), {
    bundlePath: 'bundle.json', registryPath: 'key-registry.json',
    rpcUrl: env.RPC_URL, chainId: 11155111, contractAddress: env.ANCHOR_CONTRACT_ADDRESS,
  });
  assert.throws(() => verifierConfig([], env), /BUNDLE_PATH_REQUIRED/);
  assert.throws(() => verifierConfig(['bundle.json'], { ...env, CHAIN_ID: '1.5' }), /INVALID_CHAIN_ID/);
  assert.throws(() => verifierConfig(['bundle.json'], { ...env, ANCHOR_CONTRACT_ADDRESS: '0x12' }), /INVALID_CONTRACT_ADDRESS/);
  assert.throws(() => verifierConfig(['bundle.json'], { ...env, RPC_URL: undefined }), /RPC_URL_REQUIRED/);
});
