/** Explicit disposable browser-test harness. Never used by npm start. */
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import { AnchorClient } from '../src/blockchain/anchorClient.ts';
import { InMemoryEvidenceStore } from '../src/db/memoryEvidenceStore.ts';
import { createPolicy } from '../src/enterprise/policy.ts';
import { GatewayService } from '../src/verification/service.ts';
import { verifyEvidence } from '../src/verification/verifier.ts';
import { CaseService } from '../src/api/cases.ts';
import { createApiApp } from '../src/api/app.ts';

const { viem, networkHelpers } = await hre.network.create();
const [writer] = await viem.getWalletClients();
const client = await viem.getPublicClient();
const contract = await viem.deployContract('DecisionAnchor', [writer.account.address]);
const anchor = new AnchorClient(client, writer, contract.address, await client.getChainId());
const [enterprise, agent, verification, institution] = [1, 2, 3, 4].map(n => privateKeyToAccount(`0x${String(n).padStart(64, '0')}`));
const registry = { 'enterprise-key-1': enterprise.address, 'agent-key-1': agent.address, 'verification-key-1': verification.address, 'institution-key-1': institution.address };
const policy = await createPolicy(enterprise, { policyId: 'local-preview-policy', validFrom: '2026-01-01T00:00:00Z', maxAmountBaseUnits: '4000000000' });
const store = new InMemoryEvidenceStore([policy]);
const gateway = new GatewayService(anchor, store, registry, verification, institution);
const verify = (input: unknown) => verifyEvidence(input, registry, anchor, true);
const cases = new CaseService(store, gateway, anchor, verify, agent, policy, institution.address);
createApiApp({ gateway, store, verify, cases, demosEnabled: true }).listen(3000, '127.0.0.1', () => console.log('LOCAL CHAIN TEST HARNESS :3000 — memory only, not Sepolia/Supabase'));
// Mine local blocks so missing-response status advances without fake UI timers.
setInterval(() => { void networkHelpers.mine().catch(() => {}); }, 2000);
