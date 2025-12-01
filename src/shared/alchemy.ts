import { Chains } from '@chains';
import { ChainId } from '@types';

export const ALCHEMY_NETWORKS: Record<ChainId, { key: string; price: { supported: boolean } }> = {
  [Chains.ETHEREUM.chainId]: { key: 'eth-mainnet', price: { supported: true } },
  [Chains.ETHEREUM_SEPOLIA.chainId]: { key: 'eth-sepolia', price: { supported: false } },
  [Chains.OPTIMISM.chainId]: { key: 'opt-mainnet', price: { supported: true } },
  [Chains.ARBITRUM.chainId]: { key: 'arb-mainnet', price: { supported: true } },
  [Chains.POLYGON.chainId]: { key: 'polygon-mainnet', price: { supported: true } },
  [Chains.POLYGON_MUMBAI.chainId]: { key: 'polygon-mumbai', price: { supported: false } },
  [Chains.ASTAR.chainId]: { key: 'astar-mainnet', price: { supported: false } },
  [Chains.BLAST.chainId]: { key: 'blast-mainnet', price: { supported: true } },
  [Chains.BNB_CHAIN.chainId]: { key: 'bnb-mainnet', price: { supported: true } },
  [Chains.AVALANCHE.chainId]: { key: 'avax-mainnet', price: { supported: true } },
  [Chains.FANTOM.chainId]: { key: 'fantom-mainnet', price: { supported: true } },
  [Chains.METIS_ANDROMEDA.chainId]: { key: 'metis-mainnet', price: { supported: true } },
  [Chains.POLYGON_ZKEVM.chainId]: {
    key: 'polygonzkevm-mainnet',
    price: { supported: true },
  },
  [Chains.BASE.chainId]: { key: 'base-mainnet', price: { supported: true } },
  [Chains.GNOSIS.chainId]: { key: 'gnosis-mainnet', price: { supported: true } },
  [Chains.SCROLL.chainId]: { key: 'scroll-mainnet', price: { supported: true } },
  [Chains.opBNB.chainId]: { key: 'opbnb-mainnet', price: { supported: true } },
  [Chains.MANTLE.chainId]: { key: 'mantle-mainnet', price: { supported: false } },
  [Chains.ROOTSTOCK.chainId]: { key: 'rootstock-mainnet', price: { supported: false } },
  [Chains.LINEA.chainId]: { key: 'linea-mainnet', price: { supported: true } },
  [Chains.SONIC.chainId]: { key: 'sonic-mainnet', price: { supported: false } },
  [Chains.ZK_SYNC_ERA.chainId]: { key: 'zksync-mainnet', price: { supported: true } },
  [Chains.CELO.chainId]: { key: 'celo-mainnet', price: { supported: false } },
  [Chains.PLASMA.chainId]: { key: 'plasma-mainnet', price: { supported: false } },
  [Chains.UNICHAIN.chainId]: { key: 'unichain-mainnet', price: { supported: false } },
};
