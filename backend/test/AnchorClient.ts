import assert from 'node:assert/strict';
import { it } from 'node:test';
import hre from 'hardhat';
import { keccak256, toBytes } from 'viem';
import { AnchorClient } from '../src/blockchain/anchorClient.ts';

it('AnchorClient writes and reads real local-chain request and decision anchors', async () => {
  const { viem } = await hre.network.create();
  const [writer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const contract = await viem.deployContract('DecisionAnchor', [writer.account.address]);
  const chainId = await publicClient.getChainId();
  const client = new AnchorClient(publicClient, writer, contract.address, chainId);
  const requestHash = keccak256(toBytes('request'));
  const policyHash = keccak256(toBytes('policy'));
  const decisionHash = keccak256(toBytes('decision'));

  const request = await client.anchorRequest('REQ-001', requestHash, policyHash);
  const readBefore = await client.readRecord('REQ-001');
  assert.equal(readBefore.requestHash, requestHash);
  assert.equal(readBefore.policyHash, policyHash);
  assert.equal(readBefore.requestAnchoredAt, request.observedAt);
  assert.equal(request.decisionDeadline - request.observedAt, 30);
  assert.equal(readBefore.decisionHash, null);

  const decision = await client.anchorDecision('REQ-001', decisionHash);
  const readAfter = await client.readRecord('REQ-001');
  assert.equal(readAfter.decisionHash, decisionHash);
  assert.equal(readAfter.decisionAnchoredAt, decision.anchoredAt);
  assert.ok(decision.anchoredAt <= request.decisionDeadline);
  assert.ok(await client.chainTime() >= decision.anchoredAt);
  assert.equal(await client.findDecisionTx('REQ-001', decisionHash, request.blockNumber), decision.decisionTx);
});
