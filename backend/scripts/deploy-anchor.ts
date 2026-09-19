import { network } from 'hardhat';

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();
if (networkName === 'sepolia' && chainId !== 11155111) throw new Error('WRONG_CHAIN_ID');
const [writer] = await viem.getWalletClients();
if (!writer) throw new Error('ANCHOR_WRITER_MISSING');
const anchor = await viem.deployContract('DecisionAnchor', [writer.account.address]);
const owner = await anchor.read.owner();
if (owner.toLowerCase() !== writer.account.address.toLowerCase()) throw new Error('ANCHOR_OWNER_MISMATCH');
process.stdout.write(`${JSON.stringify({ network: networkName, chainId, contractAddress: anchor.address, anchorWriter: owner })}\n`);
