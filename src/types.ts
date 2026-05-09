export type PlayerId = "player-one" | "player-two";

export type Loadout = {
  strike: number;
  guard: number;
  focus: number;
};

export type PrivateCommit = {
  player: PlayerId;
  commitment: string;
  encryptedPayload: string;
  nonce: string;
};

export type DuelResult = {
  winner: PlayerId | "draw";
  playerOneScore: number;
  playerTwoScore: number;
  margin: number;
  reveal: {
    playerOne: Loadout;
    playerTwo: Loadout;
  };
  proofDigest: string;
};

export type TranscriptEntry = {
  id: string;
  label: string;
  detail: string;
  tone: "ready" | "private" | "public";
};
