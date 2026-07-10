import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { DurakGame } from "./engine.js";
import { DurakPolicy } from "./model.js";
import { TrainingManager } from "./training.js";
import { GameMode, Move, TrainingConfig } from "./types.js";
import { GameStore } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");

const PORT = Number(process.env.PORT ?? 4100);
const frontendDist = join(PROJECT_ROOT, "frontend", "dist");
const atlasPath = join(PROJECT_ROOT, "Koloda-kart.png");
const uiKaptiPath = join(PROJECT_ROOT, "UI_KAPTI");
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const store = new GameStore();
const policy = new DurakPolicy(54 * 3 + 4 + 3 + 8 + 1 + 2);
const training = new TrainingManager(policy);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Статика для UI_KAPTI (карты)
app.use("/UI_KAPTI", express.static(uiKaptiPath, { extensions: ["png"] }));

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.get("/cards/Koloda-kart.png", (_, res) => {
  if (!existsSync(atlasPath)) {
    return res.status(404).json({ error: "atlas not found" });
  }
  res.sendFile(atlasPath);
});

app.get("/api/config", (_, res) => {
  res.json(training.snapshot().config);
});

app.post("/api/config", (req, res) => {
  training.updateConfig(req.body as Partial<TrainingConfig>);
  io.emit("training:update", training.snapshot());
  res.json(training.snapshot());
});

app.post("/api/training/start", async (_, res) => {
  await training.start();
  io.emit("training:update", training.snapshot());
  io.emit("games:update", training.getGames());
  res.json(training.snapshot());
});

app.post("/api/training/stop", (_, res) => {
  training.stop();
  io.emit("training:update", training.snapshot());
  res.json(training.snapshot());
});

app.get("/api/training/status", (_, res) => {
  res.json(training.snapshot());
});

app.get("/api/games", (_, res) => {
  res.json([...store.list(), ...training.getGames()]);
});

app.get("/api/games/:id", (req, res) => {
  const game = store.get(req.params.id);
  if (!game) {
    const trainingGame = training.getGames().find((entry) => entry.id === req.params.id);
    if (!trainingGame) return res.status(404).json({ error: "not found" });
    return res.json(trainingGame);
  }
  res.json(game.getSnapshot());
});

app.post("/api/games/human/start", (req, res) => {
  const mode = ((req.body as { mode?: GameMode }).mode ?? "podkidnoy") as GameMode;
  const game = DurakGame.create(mode, 4, [0]);
  store.add(game);
  io.emit("games:update", store.list());
  res.json(game.getSnapshot());
});

app.post("/api/games/:id/move", (req, res) => {
  const game = store.get(req.params.id);
  if (!game) return res.status(404).json({ error: "not found" });
  const move = req.body as Move;
  const result = game.applyMove(move);
  io.emit("game:update", game.getSnapshot());
  io.emit("games:update", store.list());
  res.json({ ...result, game: game.getSnapshot() });
});

app.post("/api/model/save", async (_, res) => {
  await training.saveModel();
  res.json({ ok: true, path: training.getModelPath() });
});

app.get("/api/stats", (_, res) => {
  res.json({ training: training.snapshot(), games: [...store.list(), ...training.getGames()] });
});

io.on("connection", (socket) => {
  socket.emit("training:update", training.snapshot());
  socket.emit("games:update", [...store.list(), ...training.getGames()]);
});

// Автоход ИИ в партиях с человеком
async function advanceHumanGames() {
  for (const snapshot of store.list()) {
    if (snapshot.phase === "finished") continue;
    const game = store.get(snapshot.id);
    if (!game) continue;
    if (game.phase === "finished") continue;
    const currentPlayer = game.players[game.turnIndex];
    if (!currentPlayer || currentPlayer.isHuman) continue;

    const playerIndex = game.turnIndex;
    const legalMoves = game.getLegalMoves(playerIndex);
    if (legalMoves.length === 0) continue;

    const decision = await policy.choose(game.getSnapshot(playerIndex), playerIndex, legalMoves, 0.01);
    game.applyMove(decision.move);
    io.emit("game:update", game.getSnapshot());
    io.emit("games:update", store.list());
  }
  setTimeout(() => void advanceHumanGames(), 150);
}
void advanceHumanGames();

app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  if (req.path.startsWith("/UI_KAPTI")) return next();
  if (!existsSync(frontendDist)) return res.status(404).json({ error: "frontend not built" });
  res.sendFile(join(frontendDist, "index.html"));
});

server.listen(PORT, () => {
  console.log(`AI KAPT backend running on http://localhost:${PORT}`);
});
