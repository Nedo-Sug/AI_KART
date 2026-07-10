import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DurakGame } from "./engine.js";
import { encodeState, moveToActionIndex } from "./model.js";
const DATA_DIR = join(process.cwd(), "backend", "data");
const MODEL_PATH = join(DATA_DIR, "model.json");
export class TrainingManager {
    policy;
    config;
    running = false;
    totalGames = 0;
    completedGames = 0;
    wins = [0, 0, 0, 0];
    losses = [0, 0, 0, 0];
    averageReward = 0;
    lastUpdate = null;
    games = [];
    loopHandle = null;
    rewardHistory = [];
    constructor(policy, config) {
        this.policy = policy;
        this.config = {
            mode: "mixed",
            parallelGames: 4,
            epsilon: 0.15,
            learningRate: 0.001,
            ...config,
        };
    }
    snapshot() {
        return {
            running: this.running,
            config: this.config,
            gamesRunning: this.games.length,
            totalGames: this.totalGames,
            completedGames: this.completedGames,
            wins: [...this.wins],
            losses: [...this.losses],
            averageReward: this.averageReward,
            lastUpdate: this.lastUpdate,
        };
    }
    async start() {
        if (this.running)
            return;
        mkdirSync(DATA_DIR, { recursive: true });
        await this.policy.load(MODEL_PATH);
        this.running = true;
        this.lastUpdate = new Date().toISOString();
        this.games = Array.from({ length: this.config.parallelGames }, () => this.spawnGame());
        void this.loop();
    }
    stop() {
        this.running = false;
        if (this.loopHandle)
            clearTimeout(this.loopHandle);
        this.loopHandle = null;
        this.lastUpdate = new Date().toISOString();
    }
    updateConfig(next) {
        this.config = { ...this.config, ...next };
        this.lastUpdate = new Date().toISOString();
    }
    async saveModel() {
        mkdirSync(DATA_DIR, { recursive: true });
        await this.policy.save(MODEL_PATH);
    }
    getModelPath() {
        return MODEL_PATH;
    }
    spawnGame() {
        const mode = this.config.mode === "mixed" ? (Math.random() < 0.5 ? "podkidnoy" : "perevodnoy") : this.config.mode;
        const game = DurakGame.create(mode, 4);
        return { game, experiences: [], rewardByPlayer: [0, 0, 0, 0] };
    }
    async loop() {
        while (this.running) {
            for (let index = 0; index < this.games.length; index += 1) {
                await this.stepGame(index);
            }
            this.loopHandle = setTimeout(() => void this.loop(), 20);
            return;
        }
    }
    async stepGame(index) {
        const slot = this.games[index];
        if (!slot)
            return;
        const { game, experiences } = slot;
        if (game.phase === "finished") {
            await this.finishSlot(index);
            return;
        }
        const playerIndex = game.turnIndex;
        const legalMoves = game.getLegalMoves(playerIndex);
        const snapshot = game.getSnapshot(null, { revealAll: true });
        const decision = await this.policy.choose(snapshot, playerIndex, legalMoves, this.config.epsilon);
        const state = encodeState(snapshot, playerIndex);
        const result = game.applyMove(decision.move);
        const reward = this.computeReward(result.ok, decision.move, game);
        experiences.push({ state, actionIndex: moveToActionIndex(decision.move), reward, playerIndex });
        slot.rewardByPlayer[playerIndex] += reward;
        if (game.phase === "finished") {
            await this.finishSlot(index);
        }
    }
    computeReward(ok, move, game) {
        if (!ok)
            return -1;
        if (game.phase === "finished")
            return 1;
        switch (move.type) {
            case "attack":
                return 1;
            case "defend":
                return 1;
            case "transfer":
                return 1;
            case "take":
                return 1;
            case "pass":
                return 1;
            default:
                return 1;
        }
    }
    async finishSlot(index) {
        const slot = this.games[index];
        if (!slot)
            return;
        const { game, experiences, rewardByPlayer } = slot;
        const winner = game.winnerIndex ?? -1;
        for (let player = 0; player < rewardByPlayer.length; player += 1) {
            rewardByPlayer[player] += player === winner ? 2 : -1;
        }
        for (const experience of experiences) {
            experience.reward += experience.playerIndex === winner ? 2 : -1;
        }
        if (experiences.length > 0) {
            const loss = await this.policy.train(experiences);
            this.rewardHistory.push(rewardByPlayer.reduce((sum, value) => sum + value, 0));
            if (this.rewardHistory.length > 100)
                this.rewardHistory.shift();
            this.averageReward = this.rewardHistory.reduce((sum, value) => sum + value, 0) / this.rewardHistory.length;
            this.completedGames += 1;
            this.totalGames += 1;
            if (winner >= 0) {
                this.wins[winner] += 1;
            }
            for (let i = 0; i < this.losses.length; i += 1) {
                if (i !== winner)
                    this.losses[i] += 1;
            }
            this.lastUpdate = `${new Date().toISOString()} | loss=${loss.toFixed(4)} | winner=${winner}`;
        }
        this.games[index] = this.spawnGame();
    }
    getGames() {
        return this.games.map((slot) => slot.game.getSnapshot(null, { revealAll: false }));
    }
}
