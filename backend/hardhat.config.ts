import { configVariable, defineConfig } from 'hardhat/config';
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: '0.8.28',
  networks: {
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('RPC_URL'),
      accounts: [configVariable('ANCHOR_WRITER_PRIVATE_KEY')],
    },
  },
});
