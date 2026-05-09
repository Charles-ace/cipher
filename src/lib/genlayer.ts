import type { Address } from "viem";
import { appConfig } from "../config";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

async function buildBaseOptions() {
  const chainModule = await import("genlayer-js/chains");
  const chain = chainModule[appConfig.network];

  return {
    chain,
    ...(appConfig.rpcUrl ? { endpoint: appConfig.rpcUrl } : {}),
  };
}

export async function createReadClient() {
  const [{ createClient }, options] = await Promise.all([import("genlayer-js"), buildBaseOptions()]);
  return createClient(options);
}

export async function createWriteClient(account: Address, provider: EthereumProvider) {
  const [{ createClient }, options] = await Promise.all([import("genlayer-js"), buildBaseOptions()]);
  return createClient({
    ...options,
    account,
    provider,
  });
}

export async function ensureConsensusReady(client: {
  initializeConsensusSmartContract: () => Promise<unknown>;
}) {
  await client.initializeConsensusSmartContract();
}

export function shortenAddress(value: string) {
  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
