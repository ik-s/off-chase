import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, getAddress, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { verifyUsdcTransferReceipt } from '../src/blockchain/usdcTransfer.ts';

// Circle's official Ethereum Sepolia test USDC. This script is an isolated
// token-transfer smoke test; DecisionAnchor never moves tokens.
const token = getAddress('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
const abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address,uint256) returns (bool)',
]);

const rpcUrl = process.env.RPC_URL;
const walletPath = process.env.SMOKE_WALLET_PATH;
const recipientInput = process.env.SMOKE_RECIPIENT;
if (!rpcUrl || !URL.canParse(rpcUrl)) throw new Error('RPC_URL_REQUIRED');
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
const amount = BigInt(process.env.SMOKE_AMOUNT_BASE_UNITS ?? '1000000');
if (amount <= 0n) throw new Error('INVALID_TRANSFER_AMOUNT');

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

const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
const simulation = await publicClient.simulateContract({
  account, address: token, abi, functionName: 'transfer', args: [recipient, amount],
});
if (simulation.result !== true) throw new Error('USDC_TRANSFER_SIMULATION_FAILED');
const transactionHash = await walletClient.writeContract(simulation.request);
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (!verifyUsdcTransferReceipt(receipt, { token, sender: account.address, recipient, amount })) {
  throw new Error('USDC_TRANSFER_RECEIPT_MISMATCH');
}
const [senderAfter, recipientAfter] = await Promise.all([
  publicClient.readContract({ address: token, abi, functionName: 'balanceOf', args: [account.address] }),
  publicClient.readContract({ address: token, abi, functionName: 'balanceOf', args: [recipient] }),
]);
if (senderBefore - senderAfter !== amount || recipientAfter - recipientBefore !== amount) {
  throw new Error('USDC_BALANCE_DELTA_MISMATCH');
}
process.stdout.write(`${JSON.stringify({
  status: 'VERIFIED', chainId, token, from: account.address, to: recipient,
  amountBaseUnits: amount.toString(), transactionHash, blockNumber: receipt.blockNumber.toString(),
})}\n`);
