import { keccak256, parseAbi, parseEventLogs, toBytes, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';

export const anchorAbi = parseAbi([
  'function records(bytes32) view returns (bytes32 requestHash, bytes32 policyHash, uint64 requestAnchoredAt, uint64 decisionDeadline, bytes32 decisionHash, uint64 decisionAnchoredAt)',
  'function anchorRequest(bytes32 requestKey, bytes32 requestHash, bytes32 policyHash)',
  'function anchorDecision(bytes32 requestKey, bytes32 decisionHash)',
  'event RequestAnchored(bytes32 indexed requestKey, bytes32 requestHash, bytes32 policyHash, uint64 requestAnchoredAt, uint64 decisionDeadline)',
  'event DecisionAnchored(bytes32 indexed requestKey, bytes32 decisionHash, uint64 decisionAnchoredAt)',
]);

const zero = `0x${'0'.repeat(64)}` as Hex;

export function requestKey(requestId: string): Hex {
  return keccak256(toBytes(requestId));
}

export interface AnchorRecord {
  requestHash: Hex | null;
  policyHash: Hex | null;
  requestAnchoredAt: number;
  decisionDeadline: number;
  decisionHash: Hex | null;
  decisionAnchoredAt: number | null;
}

export class ChainAnchorReader {
  protected readonly reader: PublicClient;
  readonly address: Address;
  readonly chainId: number;

  constructor(
    reader: PublicClient,
    address: Address,
    chainId: number,
  ) {
    this.reader = reader;
    this.address = address;
    this.chainId = chainId;
  }

  async readRecord(requestId: string): Promise<AnchorRecord> {
    const [requestHash, policyHash, requestAnchoredAt, decisionDeadline, decisionHash, decisionAnchoredAt] =
      await this.reader.readContract({ address: this.address, abi: anchorAbi, functionName: 'records', args: [requestKey(requestId)] });
    return {
      requestHash: requestHash === zero ? null : requestHash,
      policyHash: policyHash === zero ? null : policyHash,
      requestAnchoredAt: Number(requestAnchoredAt),
      decisionDeadline: Number(decisionDeadline),
      decisionHash: decisionHash === zero ? null : decisionHash,
      decisionAnchoredAt: decisionAnchoredAt === 0n ? null : Number(decisionAnchoredAt),
    };
  }

  async chainTime(): Promise<number> {
    const block = await this.reader.getBlock();
    return Number(block.timestamp);
  }

  async verifyRequestTx(input: {
    requestId: string; requestHash: Hex; policyHash: Hex; tx: Hex;
    blockNumber: number; observedAt: number; decisionDeadline: number;
  }): Promise<boolean> {
    try {
      const receipt = await this.reader.getTransactionReceipt({ hash: input.tx });
      if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== this.address.toLowerCase() ||
          receipt.blockNumber !== BigInt(input.blockNumber)) return false;
      const logs = parseEventLogs({ abi: anchorAbi, eventName: 'RequestAnchored', logs: receipt.logs });
      return logs.some(log => log.address.toLowerCase() === this.address.toLowerCase() &&
        log.args.requestKey === requestKey(input.requestId) &&
        log.args.requestHash === input.requestHash && log.args.policyHash === input.policyHash &&
        log.args.requestAnchoredAt === BigInt(input.observedAt) &&
        log.args.decisionDeadline === BigInt(input.decisionDeadline));
    } catch {
      return false;
    }
  }

  async verifyDecisionTx(input: {
    requestId: string; decisionHash: Hex; tx: Hex; anchoredAt: number;
  }): Promise<boolean> {
    try {
      const receipt = await this.reader.getTransactionReceipt({ hash: input.tx });
      if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== this.address.toLowerCase()) return false;
      const logs = parseEventLogs({ abi: anchorAbi, eventName: 'DecisionAnchored', logs: receipt.logs });
      return logs.some(log => log.address.toLowerCase() === this.address.toLowerCase() &&
        log.args.requestKey === requestKey(input.requestId) &&
        log.args.decisionHash === input.decisionHash && log.args.decisionAnchoredAt === BigInt(input.anchoredAt));
    } catch {
      return false;
    }
  }
}

export class AnchorClient extends ChainAnchorReader {
  private readonly writer: WalletClient;

  constructor(reader: PublicClient, writer: WalletClient, address: Address, chainId: number) {
    super(reader, address, chainId);
    if (!writer.account) throw new Error('ANCHOR_WRITER_MISSING');
    this.writer = writer;
  }

  async anchorRequest(requestId: string, requestHash: Hex, policyHash: Hex) {
    const tx = await this.writer.writeContract({
      address: this.address, abi: anchorAbi, functionName: 'anchorRequest',
      args: [requestKey(requestId), requestHash, policyHash], account: this.writer.account!, chain: this.writer.chain,
    });
    const receipt = await this.reader.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== 'success') throw new Error('REQUEST_ANCHOR_FAILED');
    const record = await this.readRecord(requestId);
    if (record.requestHash !== requestHash || record.policyHash !== policyHash) throw new Error('REQUEST_ANCHOR_MISMATCH');
    return { requestTx: tx, blockNumber: receipt.blockNumber, observedAt: record.requestAnchoredAt, decisionDeadline: record.decisionDeadline };
  }

  async anchorDecision(requestId: string, decisionHash: Hex) {
    const tx = await this.writer.writeContract({
      address: this.address, abi: anchorAbi, functionName: 'anchorDecision',
      args: [requestKey(requestId), decisionHash], account: this.writer.account!, chain: this.writer.chain,
    });
    const receipt = await this.reader.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== 'success') throw new Error('DECISION_ANCHOR_FAILED');
    const record = await this.readRecord(requestId);
    if (record.decisionHash !== decisionHash || record.decisionAnchoredAt === null) throw new Error('DECISION_ANCHOR_MISMATCH');
    return { decisionTx: tx, blockNumber: receipt.blockNumber, anchoredAt: record.decisionAnchoredAt };
  }
}
