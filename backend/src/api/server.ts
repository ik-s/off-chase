import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { AnchorClient } from '../blockchain/anchorClient.ts';
import { createSupabaseEvidenceStoreFromEnv } from '../persistence/supabaseEvidenceStore.ts';
import { CaseService, type CaseExecution } from './cases.ts';
import { createRunControl } from '../persistence/runControl.ts';
import { createPolicy } from '../enterprise/policy.ts';
import type { KeyRegistry } from '../institution/mockWallet.ts';
import { GatewayService } from '../verification/service.ts';
import { verifyEvidence } from '../verification/verifier.ts';
import { createApiApp } from './app.ts';
import { runtimeConfig } from './runtimeConfig.ts';

const RegistrySchema = z.record(z.string(), z.string().regex(/^0x[0-9a-fA-F]{40}$/));

async function loadRegistry(path: string): Promise<KeyRegistry> {
  return RegistrySchema.parse(JSON.parse(await readFile(path, 'utf8'))) as KeyRegistry;
}

function requireRegistered(registry: KeyRegistry, keyId: string, address: Address) {
  if (registry[keyId]?.toLowerCase() !== address.toLowerCase()) throw new Error(`KEY_REGISTRY_MISMATCH_${keyId}`);
}

export async function createRuntimeApp(env: NodeJS.ProcessEnv = process.env, execution: CaseExecution = {}) {
  const config = runtimeConfig(env);
  const chain = defineChain({ id: config.chainId, name: 'Trust404 configured chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl] } } });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  if (await publicClient.getChainId() !== config.chainId) throw new Error('WRONG_CHAIN_ID');
  const enterprise = privateKeyToAccount(config.enterprisePrivateKey);
  const agent = privateKeyToAccount(config.agentPrivateKey);
  const verification = privateKeyToAccount(config.verificationPrivateKey);
  const institution = privateKeyToAccount(config.institutionPrivateKey);
  const writerAccount = privateKeyToAccount(config.anchorWriterPrivateKey);
  const registry = env.KEY_REGISTRY_JSON
    ? RegistrySchema.parse(JSON.parse(env.KEY_REGISTRY_JSON)) as KeyRegistry
    : await loadRegistry(config.keyRegistryPath);
  requireRegistered(registry, 'enterprise-key-1', enterprise.address);
  requireRegistered(registry, 'agent-key-1', agent.address);
  requireRegistered(registry, 'verification-key-1', verification.address);
  requireRegistered(registry, 'institution-key-1', institution.address);
  const bytecode = await publicClient.getCode({ address: config.contractAddress });
  if (!bytecode || bytecode === '0x') throw new Error('ANCHOR_CONTRACT_NOT_DEPLOYED');
  const owner = await publicClient.readContract({ address: config.contractAddress, abi: parseAbi(['function owner() view returns (address)']), functionName: 'owner' });
  if (owner.toLowerCase() !== writerAccount.address.toLowerCase()) throw new Error('ANCHOR_WRITER_NOT_OWNER');
  if (env.ENABLE_DEMOS === 'true' && await publicClient.getBalance({ address: writerAccount.address }) === 0n) throw new Error('ANCHOR_WRITER_NEEDS_TEST_ETH');
  const writer = createWalletClient({ account: writerAccount, chain, transport: http(config.rpcUrl) });
  const anchor = new AnchorClient(publicClient, writer, config.contractAddress, config.chainId);
  const policy = await createPolicy(enterprise, { policyId: 'payment-limit-v1', validFrom: '2026-09-19T00:00:00Z', maxAmountBaseUnits: '4000000000' });
  const store = createSupabaseEvidenceStoreFromEnv(env);
  await store.savePolicy(policy);
  const gateway = new GatewayService(anchor, store, registry, verification, institution);
  const verify = (evidence: unknown) => verifyEvidence(evidence, registry, anchor, true);
  const control = createRunControl(env);
  const cases = new CaseService(store, gateway, anchor, verify, agent, policy, institution.address, { ...execution, control });
  return { app: createApiApp({ gateway, store, verify, cases, demosEnabled: env.ENABLE_DEMOS === 'true', publicDeployment: env.VERCEL === '1' }), config };
}

async function main() {
  const { app, config } = await createRuntimeApp();
  app.listen(config.port, '127.0.0.1', () => process.stdout.write(`Trust404 API listening on 127.0.0.1:${config.port}\n`));
}

if (import.meta.main) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'API_STARTUP_FAILED'}\n`);
  process.exitCode = 1;
});
