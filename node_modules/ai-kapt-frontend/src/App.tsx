import { useEffect, useMemo, useRef, useState } from "react";
import { request, socket } from "./api";

type Tab = "training" | "games" | "play" | "settings";

type GameSnapshot = {
  id: string;
  mode: string;
  phase: string;
  players: Array<{ id: number; name: string; handCount: number; hand?: Array<{ id: string; label: string; suit?: string; kind: string }>; isHuman?: boolean; score: number }>;
  table: Array<{ attack: { id: string; label: string }; defense?: { id: string; label: string } }>;
  deckCount: number;
  trumpCard: { id: string; label: string } | null;
  trumpSuit: string | null;
  attackerIndex: number;
  defenderIndex: number;
  turnIndex: number;
  maxAttackCards: number;
  log: string[];
  winnerIndex: number | null;
};

type TrainingSnapshot = {
  running: boolean;
  config: { mode: string; parallelGames: number; epsilon: number; learningRate: number };
  gamesRunning: number;
  totalGames: number;
  completedGames: number;
  wins: number[];
  losses: number[];
  averageReward: number;
  lastUpdate: string | null;
};

const defaultTraining: TrainingSnapshot = {
  running: false,
  config: { mode: "mixed", parallelGames: 4, epsilon: 0.15, learningRate: 0.001 },
  gamesRunning: 0,
  totalGames: 0,
  completedGames: 0,
  wins: [0, 0, 0, 0],
  losses: [0, 0, 0, 0],
  averageReward: 0,
  lastUpdate: null,
};

function cardFilename(cardId: string): string {
  if (cardId === "joker-black") return "JokerBlack";
  if (cardId === "joker-red") return "JokerRed";

  const rankNames: Record<string, string> = {
    "11": "Valet", "12": "Dama", "13": "Korol", "14": "Tuz",
  };
  const suitNames: Record<string, string> = {
    spades: "Piki", clubs: "Kresti", hearts: "Cherbi", diamonds: "Bubi",
  };
  const match = /^(spades|clubs|hearts|diamonds)-(\d+)$/.exec(cardId);
  if (!match) return "Rubashka";
  const rankPart = rankNames[match[2]] ?? match[2];
  return `${rankPart}${suitNames[match[1]]}`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("training");
  const [training, setTraining] = useState<TrainingSnapshot>(defaultTraining);
  const [games, setGames] = useState<GameSnapshot[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [mode, setMode] = useState("mixed");
  const [parallelGames, setParallelGames] = useState(4);
  const [epsilon, setEpsilon] = useState(0.15);
  const [status, setStatus] = useState("Готово");
  const selectedRef = useRef(selectedGame);
  selectedRef.current = selectedGame;

  useEffect(() => {
    void load();
    const onTraining = (next: TrainingSnapshot) => setTraining(next);
    const onGames = (next: GameSnapshot[]) => setGames(next);
    const onGame = (next: GameSnapshot) => {
      setGames((prev) => {
        const exists = prev.some((item) => item.id === next.id);
        return exists ? prev.map((item) => (item.id === next.id ? next : item)) : [next, ...prev];
      });
    };
    socket.on("training:update", onTraining);
    socket.on("games:update", onGames);
    socket.on("game:update", onGame);
    return () => {
      socket.off("training:update", onTraining);
      socket.off("games:update", onGames);
      socket.off("game:update", onGame);
    };
  }, []);

  useEffect(() => {
    if (!selectedGame && games.length > 0) setSelectedGame(games[0].id);
  }, [games, selectedGame]);

  const activeGame = useMemo(() => games.find((game) => game.id === selectedGame) ?? null, [games, selectedGame]);

  async function load() {
    const [trainingData, gamesData] = await Promise.all([
      request<TrainingSnapshot>("/api/training/status"),
      request<GameSnapshot[]>("/api/games"),
    ]);
    setTraining(trainingData);
    setGames(gamesData);
  }

  async function startTraining() {
    setStatus("Запуск обучения...");
    await request("/api/config", {
      method: "POST",
      body: JSON.stringify({ mode, parallelGames, epsilon }),
    });
    const next = await request<TrainingSnapshot>("/api/training/start", { method: "POST" });
    setTraining(next);
    setStatus("Обучение запущено");
  }

  async function stopTraining() {
    setStatus("Остановка обучения...");
    const next = await request<TrainingSnapshot>("/api/training/stop", { method: "POST" });
    setTraining(next);
    setStatus("Обучение остановлено");
  }

  async function startHumanGame() {
    const game = await request<GameSnapshot>("/api/games/human/start", {
      method: "POST",
      body: JSON.stringify({ mode: "podkidnoy" }),
    });
    setGames((prev) => [game, ...prev.filter((item) => item.id !== game.id)]);
    setSelectedGame(game.id);
    setTab("play");
    setStatus("Новая партия против ИИ создана");
  }

  async function saveModel() {
    await request("/api/model/save", { method: "POST" });
    setStatus("Модель сохранена");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">AI KAPT</div>
          <div className="subtitle">Дурак: подкидной, переводной, self-play, 4 ИИ</div>
        </div>
        <div className="status">{status}</div>
      </header>

      <nav className="tabs">
        {(["training", "games", "play", "settings"] as Tab[]).map((item) => (
          <button key={item} className={tab === item ? "tab active" : "tab"} onClick={() => setTab(item)}>
            {item === "training" && "Обучение"}
            {item === "games" && "Матчи"}
            {item === "play" && "Игра с ИИ"}
            {item === "settings" && "Настройки"}
          </button>
        ))}
      </nav>

      {tab === "training" && (
        <section className="grid two-col">
          <div className="panel">
            <h2>Обучение</h2>
            <label>Режим</label>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="mixed">Смешанный</option>
              <option value="podkidnoy">Подкидной</option>
              <option value="perevodnoy">Переводной</option>
            </select>
            <label>Параллельных игр</label>
            <input type="number" min={1} max={32} value={parallelGames} onChange={(event) => setParallelGames(Number(event.target.value))} />
            <label>Epsilon</label>
            <input type="number" step="0.01" min={0} max={1} value={epsilon} onChange={(event) => setEpsilon(Number(event.target.value))} />
            <div className="row">
              <button onClick={startTraining}>Старт</button>
              <button className="secondary" onClick={stopTraining}>Стоп</button>
            </div>
            <button className="secondary" onClick={saveModel}>Сохранить модель</button>
          </div>
          <div className="panel stats">
            <h2>Статистика</h2>
            <Stat label="Running" value={String(training.running)} />
            <Stat label="Games" value={String(training.gamesRunning)} />
            <Stat label="Completed" value={String(training.completedGames)} />
            <Stat label="Average reward" value={training.averageReward.toFixed(3)} />
            <Stat label="Wins" value={training.wins.join(", ")} />
            <Stat label="Last update" value={training.lastUpdate ?? "-"} />
          </div>
        </section>
      )}

      {tab === "games" && (
        <section className="panel">
          <h2>Текущие игры</h2>
          <div className="games-list">
            {games.map((game) => (
              <button key={game.id} className={game.id === selectedGame ? "game-card active" : "game-card"} onClick={() => setSelectedGame(game.id)}>
                <div>{game.mode}</div>
                <div>{game.phase}</div>
                <div>{game.id.slice(0, 8)}</div>
              </button>
            ))}
          </div>
          {activeGame && <GameViewer game={activeGame} />}
        </section>
      )}

      {tab === "play" && (
        <section className="grid two-col">
          <div className="panel">
            <h2>Игра против ИИ</h2>
            <button onClick={startHumanGame}>Новая партия</button>
            {activeGame ? <HumanGame game={activeGame} refresh={load} /> : <p>Создай партию и выбери её в списке.</p>}
          </div>
          <div className="panel">
            <h2>Просмотр</h2>
            {activeGame ? <GameViewer game={activeGame} /> : <p>Нет выбранной партии.</p>}
          </div>
        </section>
      )}

      {tab === "settings" && (
        <section className="panel">
          <h2>Настройки</h2>
          <p>Backend: <code>http://localhost:4100</code></p>
          <p>Frontend: <code>http://localhost:5173</code></p>
          <p>Модель и обучение запускаются локально на backend.</p>
          <button onClick={load}>Обновить данные</button>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GameViewer({ game }: { game: GameSnapshot }) {
  return (
    <div className="viewer">
      <div className="viewer-grid">
        <div><strong>Mode</strong><div>{game.mode}</div></div>
        <div><strong>Phase</strong><div>{game.phase}</div></div>
        <div>
          <strong>Trump</strong>
          <div className="mini-card">
            {game.trumpCard ? <CardFace label={game.trumpCard.label} cardId={game.trumpCard.id} /> : "-"}
          </div>
        </div>
        <div><strong>Deck</strong><div className="mini-card"><CardFace label={String(game.deckCount)} cardId="Rubashka" /></div></div>
      </div>
      <div className="players">
        {game.players.map((player, index) => (
          <div key={player.id} className={index === game.turnIndex ? "player active" : "player"}>
            <div>{player.name} {player.isHuman ? "(human)" : "(ai)"}</div>
            <div>Cards: {player.handCount} | Score: {player.score}</div>
          </div>
        ))}
      </div>
      <div className="table">
        {game.table.length === 0 ? <p>Стол пуст</p> : game.table.map((entry, index) => (
          <div key={`${entry.attack.id}-${index}`} className="table-row">
            <span><CardFace label={entry.attack.label} cardId={entry.attack.id} /></span>
            <span>{entry.defense ? <CardFace label={entry.defense.label} cardId={entry.defense.id} /> : "..."}</span>
          </div>
        ))}
      </div>
      <div className="log">
        {game.log.slice(-8).map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function HumanGame({ game, refresh }: { game: GameSnapshot; refresh: () => Promise<void> }) {
  const human = game.players.find((player) => player.isHuman) ?? game.players[0];
  const hand = human?.hand ?? [];
  const isHumanTurn = game.turnIndex === human?.id;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const interval = setInterval(() => void refreshRef.current(), 500);
    return () => clearInterval(interval);
  }, []);

  async function playCard(cardId: string) {
    const type = game.phase === "defend" ? "defend" : "attack";
    await request(`/api/games/${game.id}/move`, {
      method: "POST",
      body: JSON.stringify({ type, cardId, attackIndex: game.table.length - 1 }),
    });
    await refresh();
  }

  async function sendMove(type: string) {
    await request(`/api/games/${game.id}/move`, {
      method: "POST",
      body: JSON.stringify({ type }),
    });
    await refresh();
  }

  return (
    <div className="human-game">
      <div>Ваш ход: {isHumanTurn ? "да" : "нет"}</div>
      <div className="hand">
        {hand.map((card) => (
          <button key={card.id} className="card" onClick={() => void playCard(card.id)} disabled={!isHumanTurn}>
            <CardFace label={card.label} cardId={card.id} />
          </button>
        ))}
      </div>
      <div className="row">
        <button onClick={() => void sendMove("pass")} disabled={!isHumanTurn || game.phase !== "attack"}>Pass</button>
        <button onClick={() => void sendMove("take")} disabled={!isHumanTurn || game.phase !== "defend"}>Take</button>
      </div>
    </div>
  );
}

function CardFace({ label, cardId }: { label: string; cardId: string }) {
  const [failed, setFailed] = useState(false);
  const filename = cardFilename(cardId);
  const src = `/UI_KAPTI/${filename}.png`;

  if (failed) {
    return (
      <span className="card-face card-face-fallback">
        <span className="card-label">{label}</span>
      </span>
    );
  }

  return (
    <img
      className="card-img"
      src={src}
      alt={label}
      onError={() => setFailed(true)}
    />
  );
}
