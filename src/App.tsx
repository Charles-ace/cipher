import { useMemo, useState } from "react";
import {
  createPrivateCommit,
  resolvePrivateDuel,
  validateLoadout,
} from "./lib/arciumPrivacy";
import type { DuelResult, Loadout, PlayerId, PrivateCommit, TranscriptEntry } from "./types";

const initialLoadouts: Record<PlayerId, Loadout> = {
  "player-one": {
    strike: 4,
    guard: 3,
    focus: 2,
  },
  "player-two": {
    strike: 3,
    guard: 2,
    focus: 4,
  },
};

const playerNames: Record<PlayerId, string> = {
  "player-one": "Player One",
  "player-two": "Player Two",
};

const startingTranscript: TranscriptEntry[] = [
  {
    id: "ready",
    label: "MXE Lobby",
    detail: "Choose private loadouts, then seal both moves before resolving the duel.",
    tone: "ready",
  },
];

function totalPoints(loadout: Loadout) {
  return loadout.strike + loadout.guard + loadout.focus;
}

function shortHash(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function makeSecret(player: PlayerId, loadout: Loadout) {
  return `${player}:${loadout.strike}:${loadout.guard}:${loadout.focus}:arcium-duel`;
}

function outcomeLabel(result: DuelResult | null) {
  if (!result) {
    return "Awaiting sealed moves";
  }

  if (result.winner === "draw") {
    return "Draw";
  }

  return `${playerNames[result.winner]} wins`;
}

type PlayerPanelProps = {
  player: PlayerId;
  loadout: Loadout;
  commit: PrivateCommit | null;
  onChange: (key: keyof Loadout, value: number) => void;
  onSeal: () => void;
};

function PlayerPanel({ player, loadout, commit, onChange, onSeal }: PlayerPanelProps) {
  const total = totalPoints(loadout);
  const valid = validateLoadout(loadout);
  const playerNumber = player === "player-one" ? "01" : "02";

  return (
    <section className={`player-panel player-panel--${player}`}>
      <div className="panel-topline">
        <div>
          <p className="eyebrow">{playerNames[player]}</p>
          <h2>Hidden Loadout</h2>
        </div>
        <div className="player-mark">{playerNumber}</div>
      </div>

      <div className="slider-stack">
        {(["strike", "guard", "focus"] as const).map((key) => (
          <label className="stat-control" key={key}>
            <span>
              {key}
              <strong>{loadout[key]}</strong>
            </span>
            <input
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
        <button className="primary-button" disabled={!valid} onClick={onSeal} type="button">
          {commit ? "Reseal Move" : "Seal Private Move"}
        </button>
      </div>

      <div className="commit-box">
        <span>Commitment</span>
        <strong>{commit ? shortHash(commit.commitment) : "Not sealed"}</strong>
      </div>
    </section>
  );
}

export default function App() {
  const [loadouts, setLoadouts] = useState(initialLoadouts);
  const [commits, setCommits] = useState<Record<PlayerId, PrivateCommit | null>>({
    "player-one": null,
    "player-two": null,
  });
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(startingTranscript);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [status, setStatus] = useState("Local privacy simulation ready.");
  const [isResolving, setIsResolving] = useState(false);

  const canResolve = Boolean(commits["player-one"] && commits["player-two"]);
  const sealedCount = Number(Boolean(commits["player-one"])) + Number(Boolean(commits["player-two"]));

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

  function updateLoadout(player: PlayerId, key: keyof Loadout, value: number) {
    setResult(null);
    setLoadouts((current) => ({
      ...current,
      [player]: {
        ...current[player],
        [key]: value,
      },
    }));
  }

  async function sealMove(player: PlayerId) {
    const loadout = loadouts[player];
    const commit = await createPrivateCommit(player, loadout, makeSecret(player, loadout));

    setCommits((current) => ({ ...current, [player]: commit }));
    setTranscript((current) => [
      {
        id: crypto.randomUUID(),
        label: `${playerNames[player]} sealed`,
        detail: `Encrypted input accepted with commitment ${shortHash(commit.commitment)}.`,
        tone: "private",
      },
      ...current,
    ]);
    setStatus(`${playerNames[player]} sealed a private move.`);
  }

  async function resolveDuel() {
    const playerOneCommit = commits["player-one"];
    const playerTwoCommit = commits["player-two"];

    if (!playerOneCommit || !playerTwoCommit) {
      setStatus("Both players need to seal a move first.");
      return;
    }

    setIsResolving(true);
    setStatus("Submitting encrypted moves to the private resolver...");

    try {
      const nextResult = await resolvePrivateDuel(
        playerOneCommit,
        makeSecret("player-one", loadouts["player-one"]),
        playerTwoCommit,
        makeSecret("player-two", loadouts["player-two"]),
      );

      setResult(nextResult);
      setTranscript((current) => [
        {
          id: crypto.randomUUID(),
          label: "Public result",
          detail: `${outcomeLabel(nextResult)}. Scores ${nextResult.playerOneScore} to ${nextResult.playerTwoScore}.`,
          tone: "public",
        },
        ...current,
      ]);
      setStatus("Duel resolved. Only the final result and proof digest are public.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not resolve the duel.");
    } finally {
      setIsResolving(false);
    }
  }

  function resetGame() {
    setLoadouts(initialLoadouts);
    setCommits({ "player-one": null, "player-two": null });
    setTranscript(startingTranscript);
    setResult(null);
    setStatus("New private duel ready.");
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <strong>Cipher Duel</strong>
        <span>Private moves. Public result.</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Arcium Private Game Prototype</p>
          <h1>Cipher Duel</h1>
          <p>
            A two-player strategy duel where each loadout stays hidden until the private compute
            step produces a public winner, score margin, and proof digest.
          </p>
          <div className="hero-actions">
            <a href="#arena">Enter Arena</a>
            <a href="#share">Share Status</a>
          </div>
        </div>
        <div className="privacy-card">
          <span>Privacy Mode</span>
          <strong>Encrypted input simulation</strong>
          <p>Designed for Arcium MXE execution with local Web Crypto fallback.</p>
          <div className="privacy-steps">
            <span className={sealedCount >= 1 ? "step step--done" : "step"}>Seal</span>
            <span className={sealedCount === 2 ? "step step--done" : "step"}>Commit</span>
            <span className={result ? "step step--done" : "step"}>Reveal</span>
          </div>
        </div>
      </section>

      <section className="arena-strip" id="arena">
        <div>
          <span>Sealed players</span>
          <strong>{sealedCount}/2</strong>
        </div>
        <div>
          <span>Round type</span>
          <strong>Blind strategy</strong>
        </div>
        <div>
          <span>Visibility</span>
          <strong>Winner only</strong>
        </div>
      </section>

      <section className="game-grid">
        <PlayerPanel
          commit={commits["player-one"]}
          loadout={loadouts["player-one"]}
          onChange={(key, value) => updateLoadout("player-one", key, value)}
          onSeal={() => void sealMove("player-one")}
          player="player-one"
        />
        <PlayerPanel
          commit={commits["player-two"]}
          loadout={loadouts["player-two"]}
          onChange={(key, value) => updateLoadout("player-two", key, value)}
          onSeal={() => void sealMove("player-two")}
          player="player-two"
        />
      </section>

      <section className="command-bar">
        <div>
          <p className="eyebrow">Resolver</p>
          <h2>{outcomeLabel(result)}</h2>
          <p>{status}</p>
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            disabled={!canResolve || isResolving}
            onClick={() => void resolveDuel()}
            type="button"
          >
            {isResolving ? "Resolving..." : "Resolve Privately"}
          </button>
          <button className="secondary-button" onClick={resetGame} type="button">
            New Duel
          </button>
        </div>
      </section>

      <section className="intel-grid">
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
          {result ? (
            <div className="reveal-strip">
              <span>Revealed after compute</span>
              <strong>
                P1 {result.reveal.playerOne.strike}/{result.reveal.playerOne.guard}/
                {result.reveal.playerOne.focus} vs P2 {result.reveal.playerTwo.strike}/
                {result.reveal.playerTwo.guard}/{result.reveal.playerTwo.focus}
              </strong>
            </div>
          ) : null}
        </article>

        <article className="transcript">
          <p className="eyebrow">Privacy Transcript</p>
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

      <section className="share-panel" id="share">
        <div>
          <p className="eyebrow">Sharing</p>
          <h2>Local now, public after deploy</h2>
          <p>
            The link on this machine is playable at localhost. To share it with someone else, deploy
            the built app to Netlify, Vercel, or any static host and send them that public URL.
          </p>
        </div>
        <code>npm run build</code>
      </section>
    </main>
  );
}
