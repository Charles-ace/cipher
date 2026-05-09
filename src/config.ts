import type { Address } from "viem";

export const supportedNetworks = [
  "localnet",
  "studionet",
  "testnetAsimov",
  "testnetBradbury",
] as const;

export type NetworkKey = (typeof supportedNetworks)[number];

export type AppConfig = {
  contractAddress: Address | null;
  network: NetworkKey;
  rpcUrl: string | null;
};

const FALLBACK_NETWORK: NetworkKey = "studionet";

function isNetworkKey(value: string | undefined): value is NetworkKey {
  if (!value) {
    return false;
  }

  return supportedNetworks.includes(value as NetworkKey);
}

function asAddress(value: string | undefined): Address | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.startsWith("0x") ? (trimmed as Address) : null;
}

export const appConfig: AppConfig = {
  contractAddress: asAddress(import.meta.env.VITE_GENLAYER_CONTRACT_ADDRESS),
  network: isNetworkKey(import.meta.env.VITE_GENLAYER_NETWORK)
    ? import.meta.env.VITE_GENLAYER_NETWORK
    : FALLBACK_NETWORK,
  rpcUrl: import.meta.env.VITE_GENLAYER_RPC_URL?.trim() || null,
};
