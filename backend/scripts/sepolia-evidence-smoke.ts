import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, getAddress, http, parseAbi, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { AnchorClient, ChainAnchorReader } from '../src/blockchain/anchorClient.ts';
import { runEvidenceSmoke } from '../src/verification/smoke.ts';

const rpcUrl = process.env.RPC_URL;
const walletPath = process.env.SMOKE_WALLET_PATH;
const contractInput = process.env.ANCHOR_CONTRACT_ADDRESS;
const recipientInput = process.env.SMOKE_RECIPIENT;
const outputDir = process.env.SMOKE_EVIDENCE_DIR;
if (!rpcUrl || !URL.canParse(rpcUrl)) throw new Error('RPC_URL_REQUIRED');
if (!walletPath) throw new Error('SMOKE_WALLET_PATH_REQUIRED');
if (!contractInput) throw new Error('ANCHOR_CONTRACT_ADDRESS_REQUIRED');
if (!recipientInput) throw new Error('SMOKE_RECIPIENT_REQUIRED');
if (!outputDir) throw new Error('SMOKE_EVIDENCE_DIR_REQUIRED');

const savedWallet: unknown = JSON.parse(await readFile(walletPath, 'utf8'));
if (!savedWallet || typeof savedWallet !== 'object' ||
    !('privateKey' in savedWallet) || typeof savedWallet.privateKey !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(savedWallet.privateKey)) throw new Error('INVALID_SMOKE_WALLET');
const writer = privateKeyToAccount(savedWallet.privateKey as Hex);
if (!('chainId' in savedWallet) || savedWallet.chainId !== sepolia.id ||
    !('address' in savedWallet) || typeof savedWallet.address !== 'string' ||
    savedWallet.address.toLowerCase() !== writer.address.toLowerCase()) throw new Error('INVALID_SMOKE_WALLET');

const contractAddress = getAddress(contractInput);
const recipient = getAddress(recipientInput);
const readerClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const chainId = await readerClient.getChainId();
if (chainId !== sepolia.id) throw new Error(`WRONG_CHAIN_ID:${chainId}`);
const [code, owner, gasBalance] = await Promise.all([
  readerClient.getCode({ address: contractAddress }),
  readerClient.readContract({ address: contractAddress, abi: parseAbi(['function owner() view returns (address)']), functionName: 'owner' }),
  readerClient.getBalance({ address: writer.address }),
]);
if (!code || code === '0x') throw new Error('ANCHOR_CONTRACT_MISSING');
if (owner.toLowerCase() !== writer.address.toLowerCase()) throw new Error('ANCHOR_OWNER_MISMATCH');
if (gasBalance === 0n) throw new Error('INSUFFICIENT_SEPOLIA_ETH');

// A new directory prevents accidental reuse of a previous request or output.
await mkdir(outputDir, { mode: 0o700 });
const walletClient = createWalletClient({ account: writer, chain: sepolia, transport: http(rpcUrl) });
const anchor = new AnchorClient(readerClient, walletClient, contractAddress, chainId);
const independentReader = new ChainAnchorReader(
  createPublicClient({ chain: sepolia, transport: http(rpcUrl) }), contractAddress, chainId,
);
const result = await runEvidenceSmoke({
  anchor, reader: independentReader, outputDir,
  enterprise: privateKeyToAccount(generatePrivateKey()),
  agent: privateKeyToAccount(generatePrivateKey()),
  verification: privateKeyToAccount(generatePrivateKey()),
  institution: privateKeyToAccount(generatePrivateKey()),
  recipient, requestId: `REQ-SEPOLIA-${randomUUID()}`, createdAt: new Date().toISOString(),
});
process.stdout.write(`${JSON.stringify({
  status: result.report.status,
  requestId: result.bundle.request.request_id,
  decision: result.bundle.decision?.decision,
  reasonCode: result.bundle.decision?.reason_code,
  requestTx: result.bundle.anchors.request_tx,
  decisionTx: result.bundle.anchors.decision_tx,
  contractAddress,
  bundlePath: result.bundlePath,
  registryPath: result.registryPath,
})}\n`);
