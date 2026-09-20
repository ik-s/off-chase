import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import { AnchorClient, ChainAnchorReader } from '../src/blockchain/anchorClient.ts';
import { EvidenceBundleSchema } from '../src/records/schemas.ts';
import { runEvidenceSmoke } from '../src/verification/smoke.ts';
import { verifyEvidenceFile } from '../src/verification/verifyFile.ts';

it('exports a real-chain rejection that a separate file verifier accepts without institution storage', async () => {
  const { viem } = await hre.network.create();
  const [writer] = await viem.getWalletClients();
  const client = await viem.getPublicClient();
  const contract = await viem.deployContract('DecisionAnchor', [writer.account.address]);
  const chainId = await client.getChainId();
  const anchor = new AnchorClient(client, writer, contract.address, chainId);
  const reader = new ChainAnchorReader(client, contract.address, chainId);
  const directory = await mkdtemp(join(tmpdir(), 'evidence-smoke-'));
  try {
    const result = await runEvidenceSmoke({
      anchor, reader, outputDir: directory,
      enterprise: privateKeyToAccount(`0x${'0'.repeat(63)}1`),
      agent: privateKeyToAccount(`0x${'0'.repeat(63)}2`),
      institution: privateKeyToAccount(`0x${'0'.repeat(63)}3`),
      verification: privateKeyToAccount(`0x${'0'.repeat(63)}4`),
      requestId: 'REQ-LOCAL-SMOKE', createdAt: '2026-09-19T01:00:00Z',
      recipient: '0x1111111111111111111111111111111111111111',
    });
    const bundle = EvidenceBundleSchema.parse(JSON.parse(await readFile(result.bundlePath, 'utf8')));
    assert.equal(bundle.decision?.decision, 'REJECT');
    assert.equal(bundle.decision?.reason_code, 'LIMIT_EXCEEDED');
    assert.equal((await verifyEvidenceFile(result.bundlePath, result.registryPath, reader)).status, 'VERIFIED');
    assert.equal((await readFile(result.registryPath, 'utf8')).includes('privateKey'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
