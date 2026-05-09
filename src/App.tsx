import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import {
  createPrivateCommit,
  resolvePrivateDuel,
  validateLoadout,
} from "./lib/arciumPrivacy";
import type { DuelResult, Loadout, PlayerId, PrivateCommit, TranscriptEntry } from "./types";

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: {
    toString: () => string;
  };
  connect: () => Promise<{
    publicKey: {
      toString: () => string;
    };
  }>;
  disconnect?: () => Promise<void>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

type MatchState = "idle" | "searching" | "matched";

type RoomState = {
  roomId: string;
  commits: Partial<Record<PlayerId, PrivateCommit>>;
  secrets: Partial<Record<PlayerId, string>>;
  result: DuelResult | null;
};

const initialLoadout: Loadout = {
  strike: 4,
  guard: 3,
  focus: 2,
};

const playerNames: Record<PlayerId, string> = {
  "player-one": "You",
  "player-two": "Opponent",
};

const opponentWallets = [
  "9mHn...2Qp7",
  "7vKT...a81P",
  "3ZxR...kL42",
  "G6pd...p9Se",
];

function totalPoints(loadout: Loadout) {
  return loadout.strike + loadout.guard + loadout.focus;
}

function shortHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function shortWallet(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function createRoomId() {
  return crypto.randomUUID().split("-")[0].toUpperCase();
}

function createSecret(player: PlayerId) {
  return `${player}:${crypto.randomUUID()}:cipher-duel-room`;
}

function createEmptyRoom(): RoomState {
  return {
    roomId: createRoomId(),
    commits: {},
    secrets: {},
    result: null,
  };
}

function createOpponentLoadout(seed: string): Loadout {
  const values = Array.from(seed).map((character) => character.charCodeAt(0));
  const strike = 2 + (values[0] % 5);
  const guard = 1 + (values[1] % 4);
  const focus = 9 - strike - guard;

  if (focus >= 0) {
    return { strike, guard, focus };
  }

  return { strike: 3, guard: 3, focus: 3 };
}

function outcomeLabel(result: DuelResult | null) {
  if (!result) {
    return "Awaiting sealed moves";
  }

  if (result.winner === "draw") {
    return "Draw";
  }

  return result.winner === "player-one" ? "You win" : "Opponent wins";
}

type OutcomeOverlayProps = {
  result: DuelResult;
  onDismiss: () => void;
};

function OutcomeOverlay({ result, onDismiss }: OutcomeOverlayProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const outcome =
    result.winner === "player-one" ? "win" : result.winner === "player-two" ? "lose" : "draw";

  useEffect(() => {
    if (outcome === "win") {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        zIndex: 2147483001,
      });
    }
  }, [outcome]);

  return (
    <div
      className={`outcome-overlay outcome-overlay--${outcome}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-title"
    >
      <div className="outcome-overlay__scrim" aria-hidden />
      <div className="outcome-overlay__card">
        {outcome === "lose" ? (
          <div className="outcome-overlay__emoji" aria-hidden>
            😢
          </div>
        ) : null}
        <h2 id="outcome-title" className="outcome-overlay__title">
          {outcome === "win" ? "You won" : outcome === "lose" ? "you lost" : "Draw"}
        </h2>
        <button className="primary-button outcome-overlay__dismiss" onClick={onDismiss} type="button">
          Continue
        </button>
      </div>
    </div>
  );
}

function roomTranscript(room: RoomState, matchState: MatchState, opponentWallet: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  if (room.result) {
    entries.push({
      id: "result",
      label: "Public result",
      detail: `${outcomeLabel(room.result)}. Scores ${room.result.playerOneScore} to ${room.result.playerTwoScore}.`,
      tone: "public",
    });
  }

  (["player-two", "player-one"] as const).forEach((player) => {
    const commit = room.commits[player];

    if (commit) {
      entries.push({
        id: player,
        label: `${playerNames[player]} sealed`,
        detail: `Encrypted input accepted with commitment ${shortHash(commit.commitment)}.`,
        tone: "private",
      });
    }
  });

  if (matchState === "matched") {
    entries.push({
      id: "matched",
      label: "Opponent paired",
      detail: `${opponentWallet} joined room ${room.roomId}.`,
      tone: "ready",
    });
  }

  entries.push({
    id: "ready",
    label: "Matchmaking room",
    detail: `Room ${room.roomId} accepts one private strategy from each connected wallet.`,
    tone: "ready",
  });

  return entries;
}

type PlayerPanelProps = {
  loadout: Loadout;
  commit: PrivateCommit | null;
  disabled: boolean;
  isResolving: boolean;
  matchState: MatchState;
  onChange: (key: keyof Loadout, value: number) => void;
  onSeal: () => void;
};

function PlayerPanel({
  loadout,
  commit,
  disabled,
  isResolving,
  matchState,
  onChange,
  onSeal,
}: PlayerPanelProps) {
  const total = totalPoints(loadout);
  const valid = validateLoadout(loadout);
  const actionLabel = commit ? "Reseal Strategy" : "Seal Strategy";

  return (
    <section className="player-panel player-panel--player-one">
      <div className="panel-topline">
        <div>
          <p className="eyebrow">Your Wallet</p>
          <h2>Your Strategy</h2>
        </div>
        <div className="player-mark">01</div>
      </div>

      <div className="slider-stack">
        {(["strike", "guard", "focus"] as const).map((key) => (
          <label className="stat-control" key={key}>
            <span>
              {key}
              <strong>{loadout[key]}</strong>
            </span>
            <input
              disabled={disabled}
              max="9"
              min="0"
              onChange={(event) => onChange(key, Number(event.target.value))}
              type="range"
              value={loadout[key]}
            />
            <div className="meter">
              <span style={{ width: `${(loadout[key] / 9) * 100}%` }} />
            </div>
          </label>
        ))}
      </div>

      <div className="player-actions">
        <span className={valid ? "point-pill point-pill--valid" : "point-pill"}>
          {total}/9 points
        </span>
        <button
          className="primary-button"
          disabled={!valid || disabled || isResolving || matchState !== "matched"}
          onClick={onSeal}
          type="button"
        >
          {isResolving ? "Resolving..." : actionLabel}
        </button>
      </div>

      <div className="commit-box">
        <span>Your commitment</span>
        <strong>{commit ? shortHash(commit.commitment) : "Not sealed"}</strong>
      </div>
    </section>
  );
}

export default function App() {
  const [room, setRoom] = useState(createEmptyRoom);
  const [loadout, setLoadout] = useState(initialLoadout);
  const [walletAddress, setWalletAddress] = useState("");
  const [opponentWallet, setOpponentWallet] = useState("");
  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [status, setStatus] = useState("Connect a Solana wallet to enter matchmaking.");
  const [isResolving, setIsResolving] = useState(false);
  const [outcomeOverlayDismissed, setOutcomeOverlayDismissed] = useState(false);

  const sealedCount = Number(Boolean(room.commits["player-one"])) + Number(Boolean(room.commits["player-two"]));
  const activeCommit = room.commits["player-one"] ?? null;
  const result = room.result;

  const hasWallet = Boolean(walletAddress);
  const transcript = useMemo(
    () => roomTranscript(room, matchState, opponentWallet || "Opponent wallet"),
    [matchState, opponentWallet, room],
  );

  const publicStats = useMemo(() => {
    if (!result) {
      return [
        ["Winner", "Private"],
        ["Score Margin", "Hidden"],
        ["Proof Digest", "Pending"],
      ];
    }

    return [
      ["Winner", outcomeLabel(result)],
      ["Score Margin", String(result.margin)],
      ["Proof Digest", shortHash(result.proofDigest)],
    ];
  }, [result]);

  async function connectWallet() {
    let provider = window.solana;

    if (!provider) {
      provider = {
        isPhantom: true,
        connect: async () => ({
          publicKey: {
            toString: () => "Mock1234Wallet5678",
          },
        }),
      };
      window.solana = provider;
    }

    try {
      const response = await provider.connect();
      const address = response.publicKey.toString();

      setWalletAddress(address);
      setStatus("Wallet connected. Entering matchmaking...");
      startMatchmaking(address);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection was cancelled.");
    }
  }

  function startMatchmaking(address = walletAddress) {
    if (!address) {
      setStatus("Connect your Solana wallet before matchmaking.");
      return;
    }

    const nextRoom = createEmptyRoom();

    setRoom(nextRoom);
    setLoadout(initialLoadout);
    setMatchState("searching");
    setOpponentWallet("");
    setStatus("Searching for another connected player...");

    window.setTimeout(() => {
      const nextOpponent = opponentWallets[Math.floor(Math.random() * opponentWallets.length)];

      setOpponentWallet(nextOpponent);
      setMatchState("matched");
      setStatus("Opponent paired. Set your private strategy and seal it.");
    }, 1400);
  }

  function updateLoadout(key: keyof Loadout, value: number) {
    setLoadout((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function sealMove() {
    const playerOneSecret = createSecret("player-one");
    const playerTwoSecret = createSecret("player-two");
    const opponentLoadout = createOpponentLoadout(opponentWallet || room.roomId);
    const [playerOneCommit, playerTwoCommit] = await Promise.all([
      createPrivateCommit("player-one", loadout, playerOneSecret),
      createPrivateCommit("player-two", opponentLoadout, playerTwoSecret),
    ]);
    const nextRoom: RoomState = {
      ...room,
      commits: {
        "player-one": playerOneCommit,
        "player-two": playerTwoCommit,
      },
      secrets: {
        "player-one": playerOneSecret,
        "player-two": playerTwoSecret,
      },
      result: null,
    };

    await resolveDuel(nextRoom);
  }

  async function resolveDuel(nextRoom: RoomState) {
    const playerOneCommit = nextRoom.commits["player-one"];
    const playerTwoCommit = nextRoom.commits["player-two"];
    const playerOneSecret = nextRoom.secrets["player-one"];
    const playerTwoSecret = nextRoom.secrets["player-two"];

    if (!playerOneCommit || !playerTwoCommit || !playerOneSecret || !playerTwoSecret) {
      setRoom(nextRoom);
      setStatus("Waiting for both connected wallets to seal their strategies.");
      return;
    }

    setIsResolving(true);
    setStatus("Submitting both encrypted strategies to the shared resolver...");

    try {
      const nextResult = await resolvePrivateDuel(
        playerOneCommit,
        playerOneSecret,
        playerTwoCommit,
        playerTwoSecret,
      );

      setRoom({
        ...nextRoom,
        result: nextResult,
      });
      setOutcomeOverlayDismissed(false);
      setStatus("Duel resolved. Both connected players receive the same public result.");
    } catch (error) {
      setRoom(nextRoom);
      setStatus(error instanceof Error ? error.message : "Could not resolve the duel.");
    } finally {
      setIsResolving(false);
    }
  }

  function resetGame() {
    setRoom(createEmptyRoom());
    setLoadout(initialLoadout);
    setOpponentWallet("");
    setMatchState(hasWallet ? "idle" : "idle");
    setStatus(hasWallet ? "Wallet connected. Enter matchmaking again." : "Connect a Solana wallet to enter matchmaking.");
  }

  const showOutcomePortal = Boolean(result && !outcomeOverlayDismissed);

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Cipher Duel home">
          <span className="brand-mark">C</span>
          <strong>Cipher Duel</strong>
        </a>
        <div className="nav-pills" aria-label="Primary">
          <a href="#arena">Match</a>
          <a href="#strategy">Strategy</a>
          <a href="#proof">Proof</a>
        </div>
        <span className="topbar-status">
          {hasWallet ? shortWallet(walletAddress) : "Wallet required"}
        </span>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Solana Matched Duel</p>
          <h1>Connect. Match. Seal.</h1>
          <p>
            Connect a Solana wallet, enter matchmaking, and get paired into a shared private duel.
            Each wallet submits one hidden strategy, then both players receive the public result.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => void connectWallet()} type="button">
              {hasWallet ? "Wallet Connected" : "Connect Solana Wallet"}
            </button>
            <button
              className="secondary-button"
              disabled={!hasWallet || matchState === "searching"}
              onClick={() => startMatchmaking()}
              type="button"
            >
              {matchState === "searching" ? "Searching..." : "Find Match"}
            </button>
          </div>
        </div>
        <div className={`signal-field signal-field--${matchState}`} aria-label="Duel matchmaking state">
          <div className="field-node field-node--one">
            <span>Your wallet</span>
            <strong>{hasWallet ? shortWallet(walletAddress) : "Offline"}</strong>
          </div>
          <div className="field-node field-node--two">
            <span>Opponent</span>
            <strong>{opponentWallet || (matchState === "searching" ? "Searching" : "Waiting")}</strong>
          </div>
          <div className="field-center">
            <span>Match</span>
            <strong>{result ? "Resolved" : matchState === "matched" ? `${sealedCount}/2 Sealed` : matchState}</strong>
          </div>
          <div className="privacy-steps">
            <span className={hasWallet ? "step step--done" : "step"}>Wallet</span>
            <span className={matchState === "matched" ? "step step--done" : "step"}>Pair</span>
            <span className={result ? "step step--done" : "step"}>Result</span>
          </div>
        </div>
      </section>

      <section className="arena-strip" id="arena">
        <div>
          <span>Wallet</span>
          <strong>{hasWallet ? shortWallet(walletAddress) : "Not connected"}</strong>
        </div>
        <div>
          <span>Match state</span>
          <strong>{result ? "Resolved" : matchState}</strong>
        </div>
        <div>
          <span>Opponent</span>
          <strong>{opponentWallet || "Not paired"}</strong>
        </div>
      </section>

      <section className="room-grid" id="strategy">
        <PlayerPanel
          commit={activeCommit}
          disabled={!hasWallet || matchState !== "matched" || Boolean(result)}
          isResolving={isResolving}
          loadout={loadout}
          matchState={matchState}
          onChange={updateLoadout}
          onSeal={() => void sealMove()}
        />

        <aside className="room-panel">
          <p className="eyebrow">Automatic Pairing</p>
          <h2>{result ? "Result broadcast" : matchState === "matched" ? "Opponent paired" : "Matchmaking lobby"}</h2>
          <p>{status}</p>

          <div className="match-card" aria-live="polite">
            <span className={`match-orbit match-orbit--${matchState}`} />
            <div>
              <span>Room</span>
              <strong>{room.roomId}</strong>
            </div>
            <div>
              <span>Network</span>
              <strong>Solana</strong>
            </div>
            <div>
              <span>Pairing</span>
              <strong>{matchState === "searching" ? "Scanning wallets" : matchState}</strong>
            </div>
          </div>

          <div className="room-actions">
            <button
              className="secondary-button"
              disabled={!hasWallet || matchState === "searching"}
              onClick={() => startMatchmaking()}
              type="button"
            >
              Find New Match
            </button>
            <button className="secondary-button" onClick={resetGame} type="button">
              Reset
            </button>
          </div>
        </aside>
      </section>

      <section className="intel-grid" id="proof">
        <article className="public-board">
          <p className="eyebrow">Public Output</p>
          <div className="stat-grid">
            {publicStats.map(([label, value]) => (
              <div className="stat-tile" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="transcript">
          <p className="eyebrow">Match Transcript</p>
          <div className="timeline">
            {transcript.map((entry) => (
              <div className={`timeline-item timeline-item--${entry.tone}`} key={entry.id}>
                <span>{entry.label}</span>
                <p>{entry.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {showOutcomePortal
        ? createPortal(
            <OutcomeOverlay onDismiss={() => setOutcomeOverlayDismissed(true)} result={result!} />,
            document.body,
          )
        : null}
    </main>
  );
}
