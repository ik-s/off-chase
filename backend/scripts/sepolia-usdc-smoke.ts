import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, getAddress, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { z } from 'zod';
import { reserveSmokeIntent, saveSmokeIntent } from '../src/blockchain/usdcSmokeIntent.ts';
import { verifyUsdcTransferReceipt } from '../src/blockchain/usdcTransfer.ts';

// Circle's official Ethereum Sepolia test USDC. This script is an isolated
// token-transfer smoke test; DecisionAnchor never moves tokens.
const token = getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
const abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address,uint256) returns (bool)',
]);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const intentSchema = z.object({
  status: z.enum(['PENDING', 'BROADCAST', 'VERIFIED']),
  chainId: z.literal(11155111),
  token: addressSchema,
  from: addressSchema,
  to: addressSchema,
  amountBaseUnits: z.literal('1000000'),
  senderBefore: z.string().regex(/^\d+$/),
  recipientBefore: z.string().regex(/^\d+$/),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  minedTransactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

const rpcUrl = process.env.RPC_URL;
const walletPath = process.env.SMOKE_WALLET_PATH;
const verifyOnly = process.argv.includes('--verify');
const intentPath = process.env.SMOKE_INTENT_PATH ?? (walletPath ? `${walletPath}.usdc-smoke-intent.json` : undefined);
if (!rpcUrl || !URL.canParse(rpcUrl)) throw new Error('RPC_URL_REQUIRED');
if (!intentPath) throw new Error('SMOKE_INTENT_PATH_REQUIRED');
if (verifyOnly && process.argv.length !== 3) throw new Error('INVALID_ARGUMENTS');
if (!verifyOnly && process.argv.length !== 2) throw new Error('INVALID_ARGUMENTS');

let intent: z.infer<typeof intentSchema>;
if (verifyOnly) {
  intent = intentSchema.parse(JSON.parse(await readFile(intentPath, 'utf8')));
  if (!intent.transactionHash) throw new Error('SMOKE_TX_HASH_UNRECORDED_CHECK_CHAIN_NONCE');
} else {
  const recipientInput = process.env.SMOKE_RECIPIENT;
  if (!walletPath) throw new Error('SMOKE_WALLET_PATH_REQUIRED');
  if (!recipientInput) throw new Error('SMOKE_RECIPIENT_REQUIRED');
  const savedWallet: unknown = JSON.parse(await readFile(walletPath, 'utf8'));
  if (!savedWallet || typeof savedWallet !== 'object' ||
      !('privateKey' in savedWallet) || typeof savedWallet.privateKey !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(savedWallet.privateKey)) throw new Error('INVALID_SMOKE_WALLET');
  const account = privateKeyToAccount(savedWallet.privateKey as Hex);
  if (!('chainId' in savedWallet) || savedWallet.chainId !== sepolia.id ||
      !('address' in savedWallet) || typeof savedWallet.address !== 'string' ||
      savedWallet.address.toLowerCase() !== account.address.toLowerCase()) throw new Error('INVALID_SMOKE_WALLET');
  const recipient = getAddress(recipientInput);
  if (account.address === recipient) throw new Error('RECIPIENT_MUST_DIFFER');
  const amount = 1_000_000n;

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== sepolia.id) throw new Error(`WRONG_CHAIN_ID:${chainId}`);
  const decimals = await publicClient.readContract({ address: token, abi, functionName: 'decimals' });
  if (decimals !== 6) throw new Error('USDC_DECIMALS_MISMATCH');
  const [eth, senderBefore, recipientBefore] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({ address: token, abi, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: token, abi, functionName: 'balanceOf', args: [recipient] }),
  ]);
  if (eth === 0n) throw new Error('INSUFFICIENT_SEPOLIA_ETH');
  if (senderBefore < amount) throw new Error('INSUFFICIENT_TEST_USDC');

  const simulation = await publicClient.simulateContract({
    account, address: token, abi, functionName: 'transfer', args: [recipient, amount],
  });
  if (simulation.result !== true) throw new Error('USDC_TRANSFER_SIMULATION_FAILED');
  intent = {
    status: 'PENDING', chainId, token, from: account.address, to: recipient,
    amountBaseUnits: amount.toString(), senderBefore: senderBefore.toString(),
    recipientBefore: recipientBefore.toString(),
  };
  await reserveSmokeIntent(intentPath, intent);
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const transactionHash = await walletClient.writeContract(simulation.request);
  intent = { ...intent, status: 'BROADCAST', transactionHash };
  await saveSmokeIntent(intentPath, intent);
  process.stdout.write(`${JSON.stringify({ status: 'BROADCAST', transactionHash, intentPath })}\n`);
}

const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== sepolia.id || intent.chainId !== chainId || intent.token.toLowerCase() !== token.toLowerCase()) {
  throw new Error('WRONG_CHAIN_OR_TOKEN');
}
const receipt = await publicClient.waitForTransactionReceipt({ hash: intent.transactionHash as Hex });
const expected = {
  token, sender: getAddress(intent.from), recipient: getAddress(intent.to), amount: 1_000_000n,
};
if (!verifyUsdcTransferReceipt(receipt, expected)) throw new Error('USDC_TRANSFER_RECEIPT_MISMATCH');
const [senderAfter, recipientAfter] = await Promise.all([
  publicClient.readContract({ address: token, abi, functionName: 'balanceOf', args: [expected.sender] }),
  publicClient.readContract({ address: token, abi, functionName: 'balanceOf', args: [expected.recipient] }),
]);
if (BigInt(intent.senderBefore) - senderAfter !== expected.amount ||
    recipientAfter - BigInt(intent.recipientBefore) !== expected.amount) {
  throw new Error('USDC_BALANCE_DELTA_MISMATCH');
}
intent = { ...intent, status: 'VERIFIED', minedTransactionHash: receipt.transactionHash };
await saveSmokeIntent(intentPath, intent);
process.stdout.write(`${JSON.stringify({
  status: 'VERIFIED', chainId, token, from: expected.sender, to: expected.recipient,
  amountBaseUnits: intent.amountBaseUnits, transactionHash: receipt.transactionHash,
  blockNumber: receipt.blockNumber.toString(), intentPath,
})}\n`);
