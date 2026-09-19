import { createPublicClient, http, type Address } from 'viem';
import { ChainAnchorReader } from '../blockchain/anchorClient.ts';
import { verifyEvidenceFile } from './verifyFile.ts';

export function verifierConfig(args: string[], env: NodeJS.ProcessEnv) {
  if (args.length !== 1 || !args[0]) throw new Error('BUNDLE_PATH_REQUIRED');
  if (!env.RPC_URL) throw new Error('RPC_URL_REQUIRED');
  if (!URL.canParse(env.RPC_URL)) throw new Error('INVALID_RPC_URL');
  const chainId = Number(env.CHAIN_ID);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('INVALID_CHAIN_ID');
  if (!env.ANCHOR_CONTRACT_ADDRESS || !/^0x[0-9a-fA-F]{40}$/.test(env.ANCHOR_CONTRACT_ADDRESS)) {
    throw new Error('INVALID_CONTRACT_ADDRESS');
  }
  return {
    bundlePath: args[0],
    registryPath: env.KEY_REGISTRY_PATH || 'key-registry.json',
    rpcUrl: env.RPC_URL,
    chainId,
    contractAddress: env.ANCHOR_CONTRACT_ADDRESS as Address,
  };
}

async function main() {
  const config = verifierConfig(process.argv.slice(2), process.env);
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  if (await publicClient.getChainId() !== config.chainId) throw new Error('WRONG_CHAIN_ID');
  const chain = new ChainAnchorReader(publicClient, config.contractAddress, config.chainId);
  const report = await verifyEvidenceFile(config.bundlePath, config.registryPath, chain);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== 'VERIFIED') process.exitCode = 1;
}

if (import.meta.main) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'VERIFICATION_FAILED'}\n`);
    process.exitCode = 2;
  });
}
