import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import { keccak256, toBytes } from 'viem';

const requestKey = keccak256(toBytes('REQ-001'));
const requestHash = keccak256(toBytes('request'));
const policyHash = keccak256(toBytes('policy'));
const decisionHash = keccak256(toBytes('decision'));

describe('DecisionAnchor', () => {
  it('records the request policy commitment and a decision within the 30-second chain deadline', async () => {
    const { viem } = await hre.network.create();
    const [writer] = await viem.getWalletClients();
    const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
    await anchor.write.anchorRequest([requestKey, requestHash, policyHash]);
    const before = await anchor.read.records([requestKey]);
    assert.equal(before[0], requestHash);
    assert.equal(before[1], policyHash);
    assert.equal(before[3] - before[2], 30n);
    await anchor.write.anchorDecision([requestKey, decisionHash]);
    const after = await anchor.read.records([requestKey]);
    assert.equal(after[4], decisionHash);
    assert.ok(after[5] <= after[3]);
  });

  it('allows only the gateway wallet to anchor', async () => {
    const { viem } = await hre.network.create();
    const [writer, outsider] = await viem.getWalletClients();
    const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
    await assert.rejects(anchor.write.anchorRequest([requestKey, requestHash, policyHash], { account: outsider.account }));
  });

  it('rejects duplicate requests, duplicate decisions and decisions without a request', async () => {
    const { viem } = await hre.network.create();
    const [writer] = await viem.getWalletClients();
    const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
    await assert.rejects(anchor.write.anchorDecision([requestKey, decisionHash]));
    await anchor.write.anchorRequest([requestKey, requestHash, policyHash]);
    await assert.rejects(anchor.write.anchorRequest([requestKey, requestHash, policyHash]));
    await anchor.write.anchorDecision([requestKey, decisionHash]);
    await assert.rejects(anchor.write.anchorDecision([requestKey, decisionHash]));
  });

  it('rejects decisions once chain time exceeds the deadline', async () => {
    const { viem, networkHelpers } = await hre.network.create();
    const [writer] = await viem.getWalletClients();
    const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
    await anchor.write.anchorRequest([requestKey, requestHash, policyHash]);
    const record = await anchor.read.records([requestKey]);
    await networkHelpers.time.setNextBlockTimestamp(Number(record[3]) + 1);
    await assert.rejects(anchor.write.anchorDecision([requestKey, decisionHash]), /DEADLINE_EXPIRED/);
  });

  it('accepts a decision at the exact deadline', async () => {
    const { viem, networkHelpers } = await hre.network.create();
    const [writer] = await viem.getWalletClients();
    const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
    await anchor.write.anchorRequest([requestKey, requestHash, policyHash]);
    const before = await anchor.read.records([requestKey]);
    await networkHelpers.time.setNextBlockTimestamp(Number(before[3]));
    await anchor.write.anchorDecision([requestKey, decisionHash]);
    const after = await anchor.read.records([requestKey]);
    assert.equal(after[5], after[3]);
  });

  it('rejects zero hashes that would bypass duplicate protection', async () => {
    const { viem } = await hre.network.create();
    const [writer] = await viem.getWalletClients();
    const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
    const zero = `0x${'0'.repeat(64)}` as const;
    await assert.rejects(anchor.write.anchorRequest([requestKey, zero, policyHash]));
    await assert.rejects(anchor.write.anchorRequest([requestKey, requestHash, zero]));
    await anchor.write.anchorRequest([requestKey, requestHash, policyHash]);
    await assert.rejects(anchor.write.anchorDecision([requestKey, zero]));
  });
});
