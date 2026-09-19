import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, defineChain, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { AnchorClient } from '../blockchain/anchorClient.ts';
import { InMemoryEvidenceStore } from '../db/memoryEvidenceStore.ts';
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

export async function createRuntimeApp(env: NodeJS.ProcessEnv = process.env) {
  const config = runtimeConfig(env);
  const chain = defineChain({ id: config.chainId, name: 'Trust404 configured chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl] } } });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  if (await publicClient.getChainId() !== config.chainId) throw new Error('WRONG_CHAIN_ID');
  const enterprise = privateKeyToAccount(config.enterprisePrivateKey);
  const verification = privateKeyToAccount(config.verificationPrivateKey);
  const institution = privateKeyToAccount(config.institutionPrivateKey);
  const writerAccount = privateKeyToAccount(config.anchorWriterPrivateKey);
  const registry = await loadRegistry(config.keyRegistryPath);
  requireRegistered(registry, 'enterprise-key-1', enterprise.address);
  requireRegistered(registry, 'verification-key-1', verification.address);
  requireRegistered(registry, 'institution-key-1', institution.address);
  const writer = createWalletClient({ account: writerAccount, chain, transport: http(config.rpcUrl) });
  const anchor = new AnchorClient(publicClient, writer, config.contractAddress, config.chainId);
  const policy = await createPolicy(enterprise, { policyId: 'payment-limit-v1', validFrom: '2026-09-19T00:00:00Z', maxAmountBaseUnits: '4000000000' });
  const store = new InMemoryEvidenceStore([policy]);
  const gateway = new GatewayService(anchor, store, registry, verification, institution);
  return { app: createApiApp({ gateway, store, verify: (evidence) => verifyEvidence(evidence, registry, anchor) }), config };
}

async function main() {
  const { app, config } = await createRuntimeApp();
  app.listen(config.port, () => process.stdout.write(`Trust404 API listening on ${config.port}\n`));
}

if (import.meta.main) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'API_STARTUP_FAILED'}\n`);
  process.exitCode = 1;
});
