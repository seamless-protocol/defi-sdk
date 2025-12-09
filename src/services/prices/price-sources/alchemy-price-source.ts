import { ChainId, TimeString, Timestamp, TokenAddress } from '@types';
import { IFetchService } from '@services/fetch/types';
import { PriceResult, IPriceSource, PricesQueriesSupport, PriceInput } from '../types';
import { getChainByKey } from '@chains';
import { reduceTimeout } from '@shared/timeouts';
import { filterRejectedResults, groupByChain, isSameAddress, timeToSeconds } from '@shared/utils';
import { Addresses } from '@shared/constants';
import { ALCHEMY_NETWORKS } from '@shared/alchemy';
import { alchemySupportedChains, AlchemySupportedChains } from '@services/providers/provider-sources/alchemy-provider';

export class AlchemyPriceSource implements IPriceSource {
  private readonly fetch: IFetchService;
  private readonly apiKey: string;
  private readonly supported: ChainId[];

  constructor({ key, onChains, fetch }: { key: string; onChains?: AlchemySupportedChains; fetch: IFetchService }) {
    this.fetch = fetch;
    this.apiKey = key;
    if (onChains === undefined) {
      this.supported = alchemySupportedChains();
    } else if (Array.isArray(onChains)) {
      this.supported = onChains;
    } else {
      this.supported = alchemySupportedChains();
    }
  }

  supportedQueries() {
    const support: PricesQueriesSupport = {
      getCurrentPrices: true,
      getHistoricalPrices: true,
      getChart: false,
    };
    const entries = Object.entries(ALCHEMY_NETWORKS)
      .filter(([chainId]) => this.supported.includes(Number(chainId)))
      .filter(
        ([
          _,
          {
            price: { supported },
          },
        ]) => supported
      )
      .map(([chainId]) => [chainId, support]);
    return Object.fromEntries(entries);
  }

  async getCurrentPrices({
    tokens,
    config,
  }: {
    tokens: PriceInput[];
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult>>> {
    const chunks = generateChunks(tokens);
    const reducedTimeout = reduceTimeout(config?.timeout, '100');
    const promises = chunks.map((chunk) => this.getCurrentPricesInChunk(chunk, reducedTimeout));
    const pricesResults = await filterRejectedResults(promises);

    const result: Record<ChainId, Record<TokenAddress, PriceResult>> = {};
    for (const { chainId, token, price, closestTimestamp } of pricesResults.flat()) {
      if (!result[chainId]) {
        result[chainId] = {};
      }
      result[chainId][token] = { price, closestTimestamp };
    }
    return result;
  }

  async getHistoricalPrices({
    tokens,
    searchWidth,
    config,
  }: {
    tokens: { chainId: ChainId; token: TokenAddress; timestamp: Timestamp }[];
    searchWidth: TimeString | undefined;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, Record<Timestamp, PriceResult>>>> {
    console.log('getHistoricalPrices', tokens, searchWidth, config);
    return this.getBulkHistoricalPrices({ tokens, searchWidth, config });
  }

  async getChart(_: {
    tokens: PriceInput[];
    span: number;
    period: TimeString;
    bound: { from: Timestamp } | { upTo: Timestamp | 'now' };
    searchWidth?: TimeString;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult[]>>> {
    return Promise.reject(new Error('Operation not supported'));
  }

  private async getBulkHistoricalPrices({
    tokens,
    searchWidth,
    config,
  }: {
    tokens: { chainId: ChainId; token: TokenAddress; timestamp: Timestamp }[];
    searchWidth: TimeString | undefined;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, Record<Timestamp, PriceResult>>>> {
    if (tokens.length === 0) {
      return {};
    }
    const range = resolveRangeParameters(searchWidth);
    console.log('getBulkHistoricalPrices', tokens, range, config);
    const results = await Promise.all(tokens.map((tokenInput) => this.fetchHistoricalPrice(tokenInput, range, config)));
    console.log('results', results);
    const response: Record<ChainId, Record<TokenAddress, Record<Timestamp, PriceResult>>> = {};
    for (const entry of results) {
      if (!entry) continue;
      const { chainId, token, timestamp, price } = entry;
      if (!response[chainId]) response[chainId] = {};
      if (!response[chainId][token]) response[chainId][token] = {};
      response[chainId][token][timestamp] = price;
    }
    return response;
  }

  private async fetchHistoricalPrice(
    { chainId, token, timestamp }: { chainId: ChainId; token: TokenAddress; timestamp: Timestamp },
    range: HistoricalRangeOptions,
    config: { timeout?: TimeString } | undefined
  ): Promise<HistoricalFetchResult | undefined> {
    const network = ALCHEMY_NETWORKS[chainId];
    if (!network?.price.supported) {
      return;
    }
    const normalizedToken = isSameAddress(token, Addresses.NATIVE_TOKEN) ? getChainByKey(chainId)?.wToken ?? Addresses.ZERO_ADDRESS : token;
    const startTime = Math.max(0, timestamp - range.halfRangeSeconds);
    let endTime = timestamp + range.halfRangeSeconds;
    if (endTime - startTime > range.rangeSeconds) {
      endTime = startTime + range.rangeSeconds;
    }
    try {
      console.log('fetchHistoricalPrice', chainId, token, timestamp, range, config);
      const response = await this.fetch.fetch(`https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/historical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: network.key,
          address: normalizedToken,
          startTime,
          endTime,
          interval: range.interval,
        }),
        timeout: config?.timeout,
      });
      console.log('response', response);
      if (!response.ok) {
        return;
      }
      const body: HistoricalPriceResponse = await response.json();
      const prices = normalizePrices(body);
      if (prices.length === 0) {
        return;
      }
      const closest = prices.reduce<NormalizedHistoricalPrice | undefined>((best, current) => {
        if (!best) return current;
        return Math.abs(current.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? current : best;
      }, undefined);
      if (!closest) {
        return;
      }
      if (Math.abs(closest.timestamp - timestamp) > range.toleranceSeconds) {
        return;
      }
      return { chainId, token, timestamp, price: { price: closest.value, closestTimestamp: closest.timestamp } };
    } catch {
      return;
    }
  }

  private async getCurrentPricesInChunk(chunk: PriceInput[], timeout?: TimeString) {
    const url = `https://api.g.alchemy.com/prices/v1/${this.apiKey}/tokens/by-address`;
    const response = await this.fetch.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addresses: chunk.map(({ chainId, token }) => ({
          network: ALCHEMY_NETWORKS[chainId].key,
          address: isSameAddress(token, Addresses.NATIVE_TOKEN)
            ? // Most chains don't support native tokens, so we use the wrapped native token when possible
              getChainByKey(chainId)?.wToken ?? Addresses.ZERO_ADDRESS
            : token,
        })),
      }),
      timeout,
    });

    if (!response.ok) {
      return [];
    }
    const body: CurrentPricesResponse = await response.json();
    return chunk
      .map(({ chainId, token }, index) => {
        const tokenPrice = body.data[index].prices[0];
        if (!tokenPrice) return;
        const timestamp = Math.floor(new Date(tokenPrice.lastUpdatedAt).getTime() / 1000);
        return { chainId, token, price: Number(tokenPrice.value), closestTimestamp: timestamp };
      })
      .filter((result): result is { chainId: ChainId; token: TokenAddress; price: number; closestTimestamp: Timestamp } => result !== undefined);
  }
}

const DEFAULT_SEARCH_WIDTH: TimeString = '6h';
const MIN_TOLERANCE_SECONDS = 60;
const MIN_RANGE_SECONDS = 600;
const INTERVAL_RULES = [
  { interval: '5m', maxRangeSeconds: 7 * 24 * 60 * 60 },
  { interval: '1h', maxRangeSeconds: 30 * 24 * 60 * 60 },
  { interval: '1d', maxRangeSeconds: 365 * 24 * 60 * 60 },
] as const;

type HistoricalRangeOptions = {
  interval: (typeof INTERVAL_RULES)[number]['interval'];
  toleranceSeconds: number;
  halfRangeSeconds: number;
  rangeSeconds: number;
};

type HistoricalFetchResult = { chainId: ChainId; token: TokenAddress; timestamp: Timestamp; price: PriceResult };
type NormalizedHistoricalPrice = { value: number; timestamp: number };

// TODO: fix range
function resolveRangeParameters(searchWidth: TimeString | undefined): HistoricalRangeOptions {
  const toleranceSeconds = Math.max(timeToSeconds(searchWidth ?? DEFAULT_SEARCH_WIDTH), MIN_TOLERANCE_SECONDS);
  const desiredRange = Math.max(toleranceSeconds * 2, MIN_RANGE_SECONDS);
  const intervalRule =
    INTERVAL_RULES.find(({ maxRangeSeconds }) => desiredRange <= maxRangeSeconds) ?? INTERVAL_RULES[INTERVAL_RULES.length - 1];
  const rangeSeconds = Math.min(desiredRange, intervalRule.maxRangeSeconds);
  const halfRangeSeconds = Math.max(1, Math.floor(rangeSeconds / 2));
  return {
    interval: intervalRule.interval,
    toleranceSeconds,
    halfRangeSeconds,
    rangeSeconds,
  };
}

function normalizePrices(body: HistoricalPriceResponse): NormalizedHistoricalPrice[] {
  return (body.data?.prices ?? [])
    .map((price) => {
      const value = Number(price.value);
      const timestamp = normalizeTimestamp(price.timestamp);
      if (!Number.isFinite(value) || timestamp === undefined) {
        return undefined;
      }
      return { value, timestamp };
    })
    .filter((price): price is NormalizedHistoricalPrice => price !== undefined);
}

function normalizeTimestamp(timestamp: string | number | undefined): number | undefined {
  if (typeof timestamp === 'number') {
    return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  }
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) return undefined;
    return Math.floor(parsed / 1000);
  }
  return undefined;
}

function generateChunks(tokens: PriceInput[]) {
  const groupedByChain = groupByChain(tokens, ({ token }) => token);
  const tokensSortedByChain = Object.entries(groupedByChain)
    .sort(([, tokensA], [, tokensB]) => tokensB.length - tokensA.length) // Sort by chain with most tokens, descending
    .flatMap(([chainId, tokens]) => tokens.map((token) => ({ chainId: Number(chainId), token })));

  const chunks: PriceInput[][] = [];
  let chunk: PriceInput[] = [];
  let chainsInChunk: Set<ChainId> = new Set();
  for (const token of tokensSortedByChain) {
    if (chunk.length === 25 || (chainsInChunk.size === 3 && !chainsInChunk.has(token.chainId))) {
      chunks.push(chunk);
      chunk = [];
      chainsInChunk = new Set();
    }
    chunk.push(token);
    chainsInChunk.add(token.chainId);
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
}

type CurrentPricesResponse = {
  data: { address: TokenAddress; prices: { currency: string; value: string; lastUpdatedAt: string }[] }[];
};

type HistoricalPriceResponse = {
  data?: {
    prices?: { value: string; timestamp: string | number }[];
  };
};
