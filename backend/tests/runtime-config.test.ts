import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeConfig } from '../src/api/runtimeConfig.ts';

const env = {
  PORT: '4310', RPC_URL: 'https://sepolia.example.invalid', CHAIN_ID: '11155111',
  ANCHOR_CONTRACT_ADDRESS: `0x${'1'.repeat(40)}`, KEY_REGISTRY_PATH: 'keys.json',
  ENTERPRISE_PRIVATE_KEY: `0x${'1'.repeat(64)}`, VERIFICATION_PRIVATE_KEY: `0x${'2'.repeat(64)}`,
  INSTITUTION_PRIVATE_KEY: `0x${'3'.repeat(64)}`, ANCHOR_WRITER_PRIVATE_KEY: `0x${'4'.repeat(64)}`,
  AGENT_PRIVATE_KEY: `0x${'5'.repeat(64)}`,
};

test('runtime configuration validates required addresses, keys and network settings', () => {
  assert.deepEqual(runtimeConfig(env), {
    port: 4310, rpcUrl: env.RPC_URL, chainId: 11155111, contractAddress: env.ANCHOR_CONTRACT_ADDRESS,
    keyRegistryPath: 'keys.json', enterprisePrivateKey: env.ENTERPRISE_PRIVATE_KEY,
    agentPrivateKey: env.AGENT_PRIVATE_KEY,
    verificationPrivateKey: env.VERIFICATION_PRIVATE_KEY, institutionPrivateKey: env.INSTITUTION_PRIVATE_KEY,
    anchorWriterPrivateKey: env.ANCHOR_WRITER_PRIVATE_KEY,
  });
  assert.throws(() => runtimeConfig({ ...env, PORT: '0' }), /INVALID_PORT/);
  assert.throws(() => runtimeConfig({ ...env, RPC_URL: 'not-a-url' }), /INVALID_RPC_URL/);
  assert.throws(() => runtimeConfig({ ...env, AGENT_PRIVATE_KEY: undefined, ENTERPRISE_PRIVATE_KEY: undefined }), /ENTERPRISE_PRIVATE_KEY_REQUIRED/);
});
