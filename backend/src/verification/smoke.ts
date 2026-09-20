import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Address } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { createRequest } from '../agent/mockAgent.ts';
import { AnchorClient, ChainAnchorReader } from '../blockchain/anchorClient.ts';
import { createPolicy } from '../enterprise/policy.ts';
import type { KeyRegistry } from '../institution/mockWallet.ts';
import type { DecisionRecord, EvidenceBundle, PolicyRecord } from '../records/schemas.ts';
import { GatewayService, type EvidenceStore } from './service.ts';
import { verifyEvidenceFile } from './verifyFile.ts';

class FileSmokeStore implements EvidenceStore {
  private bundle: EvidenceBundle | null = null;
  private decision: DecisionRecord | null = null;
  private readonly policy: PolicyRecord;
  private readonly bundlePath: string;
  constructor(policy: PolicyRecord, bundlePath: string) {
    this.policy = policy;
    this.bundlePath = bundlePath;
  }
  async getPolicy(id: string) { return id === this.policy.policy_id ? this.policy : null; }
  async getBundle(id: string) { return this.bundle?.request.request_id === id ? this.bundle : null; }
  async saveBundle(bundle: EvidenceBundle) {
    this.bundle = structuredClone(bundle);
    await writeFile(this.bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
  }
  async saveDecision(decision: DecisionRecord) { this.decision = structuredClone(decision); }
  async deleteInstitutionDecision(id: string) { if (this.decision?.request_id === id) this.decision = null; }
}

export async function runEvidenceSmoke(input: {
  anchor: AnchorClient;
  reader: ChainAnchorReader;
  outputDir: string;
  enterprise: PrivateKeyAccount;
  agent: PrivateKeyAccount;
  verification: PrivateKeyAccount;
  institution: PrivateKeyAccount;
  recipient: Address;
  requestId: string;
  createdAt: string;
}) {
  const registry: KeyRegistry = {
    'enterprise-key-1': input.enterprise.address,
    'agent-key-1': input.agent.address,
    'verification-key-1': input.verification.address,
    'institution-key-1': input.institution.address,
  };
  const registryPath = join(input.outputDir, 'key-registry.json');
  const bundlePath = join(input.outputDir, 'evidence-bundle.json');
  const policy = await createPolicy(input.enterprise, {
    policyId: 'payment-limit-v1',
    validFrom: new Date(Date.parse(input.createdAt) - 60_000).toISOString(),
    maxAmountBaseUnits: '4000000000',
  });
  const request = await createRequest(input.agent, policy, {
    requestId: input.requestId, createdAt: input.createdAt,
    amountBaseUnits: '4500000000', recipient: input.recipient,
  });
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const store = new FileSmokeStore(policy, bundlePath);
  const gateway = new GatewayService(input.anchor, store, registry, input.verification, input.institution);
  const bundle = await gateway.submitRequest(request);
  const report = await verifyEvidenceFile(bundlePath, registryPath, input.reader);
  if (report.status !== 'VERIFIED') throw new Error(`EVIDENCE_VERIFICATION_FAILED:${report.status}`);
  return { bundlePath, registryPath, bundle, report };
}
