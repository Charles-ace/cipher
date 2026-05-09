import type { DuelResult, Loadout, PlayerId, PrivateCommit } from "../types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(hash)).slice(0, 32);
}

async function deriveKey(secret: string, nonce: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 120_000,
      salt: encoder.encode(nonce),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptPayload(loadout: Loadout, secret: string, nonce: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, nonce);
  const payload = JSON.stringify(loadout);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(payload));

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptPayload(payload: string, secret: string, nonce: string) {
  const [ivValue, encryptedValue] = payload.split(".");

  if (!ivValue || !encryptedValue) {
    throw new Error("Encrypted payload is malformed.");
  }

  const key = await deriveKey(secret, nonce);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    key,
    base64ToBytes(encryptedValue),
  );

  return JSON.parse(decoder.decode(decrypted)) as Loadout;
}

export function validateLoadout(loadout: Loadout) {
  const values = [loadout.strike, loadout.guard, loadout.focus];
  const total = values.reduce((sum, value) => sum + value, 0);

  return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 9) && total === 9;
}

export async function createPrivateCommit(
  player: PlayerId,
  loadout: Loadout,
  secret: string,
): Promise<PrivateCommit> {
  if (!validateLoadout(loadout)) {
    throw new Error("Each loadout must spend exactly 9 points.");
  }

  const nonce = crypto.randomUUID();
  const encryptedPayload = await encryptPayload(loadout, secret, nonce);
  const commitment = await digest(`${player}:${nonce}:${encryptedPayload}`);

  return {
    player,
    commitment,
    encryptedPayload,
    nonce,
  };
}

function scoreLoadouts(playerOne: Loadout, playerTwo: Loadout) {
  const playerOneScore =
    playerOne.strike * 3 + playerOne.focus * 2 + playerOne.guard - playerTwo.guard * 2;
  const playerTwoScore =
    playerTwo.strike * 3 + playerTwo.focus * 2 + playerTwo.guard - playerOne.guard * 2;

  if (playerOneScore === playerTwoScore) {
    return { winner: "draw" as const, playerOneScore, playerTwoScore };
  }

  return {
    winner: playerOneScore > playerTwoScore ? ("player-one" as const) : ("player-two" as const),
    playerOneScore,
    playerTwoScore,
  };
}

export async function resolvePrivateDuel(
  playerOneCommit: PrivateCommit,
  playerOneSecret: string,
  playerTwoCommit: PrivateCommit,
  playerTwoSecret: string,
): Promise<DuelResult> {
  const [playerOne, playerTwo] = await Promise.all([
    decryptPayload(playerOneCommit.encryptedPayload, playerOneSecret, playerOneCommit.nonce),
    decryptPayload(playerTwoCommit.encryptedPayload, playerTwoSecret, playerTwoCommit.nonce),
  ]);

  if (!validateLoadout(playerOne) || !validateLoadout(playerTwo)) {
    throw new Error("One of the encrypted loadouts is invalid.");
  }

  const scored = scoreLoadouts(playerOne, playerTwo);
  const proofDigest = await digest(
    [
      playerOneCommit.commitment,
      playerTwoCommit.commitment,
      scored.winner,
      scored.playerOneScore,
      scored.playerTwoScore,
    ].join(":"),
  );

  return {
    ...scored,
    margin: Math.abs(scored.playerOneScore - scored.playerTwoScore),
    reveal: {
      playerOne,
      playerTwo,
    },
    proofDigest,
  };
}
