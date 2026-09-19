import { parseAbi, parseEventLogs, type Address, type TransactionReceipt } from 'viem';

const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

export function verifyUsdcTransferReceipt(
  receipt: TransactionReceipt,
  expected: { token: Address; sender: Address; recipient: Address; amount: bigint },
): boolean {
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== expected.token.toLowerCase()) return false;
  const logs = parseEventLogs({ abi: transferAbi, eventName: 'Transfer', logs: receipt.logs, strict: false });
  return logs.some(log =>
    log.address.toLowerCase() === expected.token.toLowerCase() &&
    log.args.from?.toLowerCase() === expected.sender.toLowerCase() &&
    log.args.to?.toLowerCase() === expected.recipient.toLowerCase() &&
    log.args.value === expected.amount);
}
