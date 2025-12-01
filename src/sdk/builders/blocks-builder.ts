import { IFetchService } from '@services/fetch';
import { IBlocksService, IBlocksSource } from '@services/blocks';
import { DefiLlamaBlockSource } from '@services/blocks/block-sources/defi-llama-block-source';
import { BlocksService } from '@services/blocks/block-service';
import { IProviderService } from '@services/providers';
import { RPCBlockSource } from '@services/blocks/block-sources/rpc-block-source';
import { FallbackBlockSource } from '@services/blocks/block-sources/fallback-block-source';

export type BlocksSourceInput =
  | { type: 'custom'; instance: IBlocksSource }
  | { type: 'custom-with-underlying'; underlyingSource: BlocksSourceInput; build: (underlying: IBlocksSource) => IBlocksSource }
  | { type: 'defi-llama' }
  | { type: 'rpc' }
  | { type: 'fallback'; sources: BlocksSourceInput[] };
export type BuildBlocksParams = { source: BlocksSourceInput };

export function buildBlocksService(
  params: BuildBlocksParams | undefined,
  fetchService: IFetchService,
  providerService: IProviderService
): IBlocksService {
  const source = buildSource(params?.source, { fetchService, providerService });
  return new BlocksService(source);
}

function buildSource(
  source: BlocksSourceInput | undefined,
  { fetchService, providerService }: { fetchService: IFetchService; providerService: IProviderService }
): IBlocksSource {
  switch (source?.type) {
    case undefined:
    case 'defi-llama':
      return new DefiLlamaBlockSource(fetchService, providerService);
    case 'rpc':
      return new RPCBlockSource(providerService);
    case 'fallback':
      return new FallbackBlockSource(source.sources.map((source) => buildSource(source, { fetchService, providerService })));
    case 'custom':
      return source.instance;
    case 'custom-with-underlying': {
      const underlying = buildSource(source.underlyingSource, { fetchService, providerService });
      return source.build(underlying);
    }
  }
}
