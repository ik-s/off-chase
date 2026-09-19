import type { Address, Hex } from 'viem';

export interface RuntimeConfig {
  port: number;
  rpcUrl: string;
  chainId: number;
  contractAddress: Address;
  keyRegistryPath: string;
  enterprisePrivateKey: Hex;
  verificationPrivateKey: Hex;
  institutionPrivateKey: Hex;
  anchorWriterPrivateKey: Hex;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function privateKey(env: NodeJS.ProcessEnv, name: string): Hex {
  const value = required(env, name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`INVALID_${name}`);
  return value as Hex;
}

export function runtimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
  const rpcUrl = required(env, 'RPC_URL');
  if (!URL.canParse(rpcUrl)) throw new Error('INVALID_RPC_URL');
  const chainId = Number(required(env, 'CHAIN_ID'));
  if (!Number.isSafeInteger(chainId) || chainId < 1) throw new Error('INVALID_CHAIN_ID');
  const contractAddress = required(env, 'ANCHOR_CONTRACT_ADDRESS');
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error('INVALID_CONTRACT_ADDRESS');
  return {
    port, rpcUrl, chainId, contractAddress: contractAddress as Address,
    keyRegistryPath: env.KEY_REGISTRY_PATH || 'key-registry.json',
    enterprisePrivateKey: privateKey(env, 'ENTERPRISE_PRIVATE_KEY'),
    verificationPrivateKey: privateKey(env, 'VERIFICATION_PRIVATE_KEY'),
    institutionPrivateKey: privateKey(env, 'INSTITUTION_PRIVATE_KEY'),
    anchorWriterPrivateKey: privateKey(env, 'ANCHOR_WRITER_PRIVATE_KEY'),
  };
}
