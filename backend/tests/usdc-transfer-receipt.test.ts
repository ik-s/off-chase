import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Address, type TransactionReceipt } from 'viem';
import { verifyUsdcTransferReceipt } from '../src/blockchain/usdcTransfer.ts';

const usdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;
const wrongToken = '0x1111111111111111111111111111111111111111' as Address;
const sender = '0x2222222222222222222222222222222222222222' as Address;
const recipient = '0x3333333333333333333333333333333333333333' as Address;
const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

function receipt(token: Address, amount: bigint, status: 'success' | 'reverted' = 'success') {
  return {
    status,
    to: usdc,
    logs: [{
      address: token,
      topics: encodeEventTopics({ abi: transferAbi, eventName: 'Transfer', args: { from: sender, to: recipient } }),
      data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
    }],
  } as TransactionReceipt;
}

test('accepts only a successful USDC receipt with the exact sender, recipient and amount', () => {
  const expected = { token: usdc, sender, recipient, amount: 1_000_000n };
  assert.equal(verifyUsdcTransferReceipt(receipt(usdc, 1_000_000n), expected), true);
  assert.equal(verifyUsdcTransferReceipt(receipt(wrongToken, 1_000_000n), expected), false);
  assert.equal(verifyUsdcTransferReceipt(receipt(usdc, 2_000_000n), expected), false);
  assert.equal(verifyUsdcTransferReceipt(receipt(usdc, 1_000_000n, 'reverted'), expected), false);
});
