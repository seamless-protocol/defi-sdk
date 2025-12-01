import ms from 'ms';
import chai, { expect } from 'chai';
import { Chains, getChainByKey } from '@chains';
import { ChainId, Timestamp } from '@types';
import chaiAsPromised from 'chai-as-promised';
import dotenv from 'dotenv';
import { FetchService } from '@services/fetch/fetch-service';
import { DefiLlamaBlockSource } from '@services/blocks/block-sources/defi-llama-block-source';
import { RPCBlockSource } from '@services/blocks/block-sources/rpc-block-source';
import { BlockResult, IBlocksSource } from '@services/blocks';
import { ProviderService } from '@services/providers/provider-service';
import { PublicRPCsProviderSource } from '@services/providers/provider-sources/public-rpcs-provider';
import { FallbackBlockSource } from '@services/blocks/block-sources/fallback-block-source';
import { AlchemyProviderSource } from '@services/providers/provider-sources/alchemy-provider';
dotenv.config();
chai.use(chaiAsPromised);

const TESTS: Record<ChainId, Timestamp[]> = {
  [Chains.OPTIMISM.chainId]: [1672531200], // Sunday, January 1, 2023 12:00:00 AM
  [Chains.POLYGON.chainId]: [1651363200], // Sunday, May 1, 2022 12:00:00 AM
  [Chains.ARBITRUM.chainId]: [
    1672531200, // Sunday, January 1, 2023 12:00:00 AM
    1717200000, // Saturday, June 1, 2024 12:00:00 AM
    1681108210, // Monday, April 10, 2023 6:30:10 AM
  ],
  [Chains.ETHEREUM.chainId]: [
    1755865480, // Friday, August 22, 2025 12:24:40 PM
    1755865483, // Friday, August 22, 2025 12:24:43 PM
  ],
};

const PROVIDER_SERVICE = new ProviderService({
  source: process.env.ALCHEMY_API_KEY ? new AlchemyProviderSource({ key: process.env.ALCHEMY_API_KEY }) : new PublicRPCsProviderSource(),
});
const FETCH_SERVICE = new FetchService();
const DEFI_LLAMA_BLOCKS_SOURCE = new DefiLlamaBlockSource(FETCH_SERVICE, PROVIDER_SERVICE);
const RPC_BLOCKS_SOURCE = new RPCBlockSource(PROVIDER_SERVICE);
const FALLBACK_BLOCK_SOURCE = new FallbackBlockSource([RPC_BLOCKS_SOURCE, DEFI_LLAMA_BLOCKS_SOURCE]);

jest.retryTimes(2);
jest.setTimeout(ms('3m'));

describe('Blocks Sources', () => {
  // blocksSourceTest({ title: 'Defi Llama Source', source: DEFI_LLAMA_BLOCKS_SOURCE }); DefiLlama is not passing tests since they sometimes return a block that is not exactly the closest, but the second closest
  blocksSourceTest({ title: 'RPC Source', source: RPC_BLOCKS_SOURCE });
  blocksSourceTest({ title: 'Fallback Source', source: FALLBACK_BLOCK_SOURCE });

  function blocksSourceTest({ title, source }: { title: string; source: IBlocksSource }) {
    describe(title, () => {
      describe('getBlocksClosestToTimestamps', () => {
        let result: Record<ChainId, Record<Timestamp, BlockResult>>;
        beforeAll(async () => {
          const timestamps = Object.entries(TESTS).flatMap(([chainId, timestamps]) =>
            timestamps.map((timestamp) => ({ chainId: Number(chainId), timestamp }))
          );
          result = await source.getBlocksClosestToTimestamps({ timestamps });
        });

        for (const chainId in TESTS) {
          const chain = getChainByKey(chainId);
          test(chain?.name ?? `Chain with id ${chainId}`, async () => {
            const timestamps = TESTS[chainId];
            for (const timestamp of timestamps) {
              const blockResult = result[chainId][timestamp];
              const viemClient = PROVIDER_SERVICE.getViemPublicClient({ chainId: Number(chainId) });
              const [before, block, after] = await Promise.all([
                viemClient.getBlock({ blockNumber: blockResult.block - 1n }),
                viemClient.getBlock({ blockNumber: blockResult.block }),
                viemClient.getBlock({ blockNumber: blockResult.block + 1n }),
              ]);
              const timestampDiffBefore = Math.abs(Number(before.timestamp) - timestamp);
              const timestampDiff = Math.abs(Number(block.timestamp) - timestamp);
              const timestampDiffAfter = Math.abs(Number(after.timestamp) - timestamp);
              expect(timestampDiff, `It seems that block ${before.number} is closer to timestamp ${timestamp} than ${block.number}`).to.be.lte(
                timestampDiffBefore
              );
              expect(timestampDiff, `It seems that block ${after.number} is closer to timestamp ${timestamp} than ${block.number}`).to.be.lte(
                timestampDiffAfter
              );
              expect(blockResult.timestamp).to.be.equal(Number(block.timestamp));
            }
          });
        }
      });
    });
  }
});
