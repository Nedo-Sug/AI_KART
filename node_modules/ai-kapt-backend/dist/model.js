import * as tf from "@tensorflow/tfjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const ACTION_SPACE = 58;
function cardToIndex(card) {
    if (card.kind === "joker")
        return card.color === "black" ? 52 : 53;
    const suitOffset = { spades: 0, clubs: 13, hearts: 26, diamonds: 39 }[card.suit ?? "spades"];
    return suitOffset + (card.rank - 2);
}
function encodeCardCount(cards) {
    const values = new Array(54).fill(0);
    for (const card of cards) {
        values[cardToIndex(card)] = 1;
    }
    return values;
}
export function encodeState(snapshot, playerIndex) {
    const player = snapshot.players[playerIndex];
    const ownHand = encodeCardCount((player?.hand ?? []));
    const tableAttacks = encodeCardCount(snapshot.table.map((entry) => entry.attack));
    const tableDefenses = encodeCardCount(snapshot.table.map((entry) => entry.defense).filter((card) => Boolean(card)));
    const playerCounts = snapshot.players.map((entry) => entry.handCount / 20).slice(0, 4);
    while (playerCounts.length < 4)
        playerCounts.push(0);
    const phase = snapshot.phase === "attack" ? [1, 0, 0] : snapshot.phase === "defend" ? [0, 1, 0] : [0, 0, 1];
    const trump = [snapshot.trumpSuit === "spades" ? 1 : 0, snapshot.trumpSuit === "clubs" ? 1 : 0, snapshot.trumpSuit === "hearts" ? 1 : 0, snapshot.trumpSuit === "diamonds" ? 1 : 0];
    const roles = [snapshot.attackerIndex === playerIndex ? 1 : 0, snapshot.defenderIndex === playerIndex ? 1 : 0, snapshot.turnIndex === playerIndex ? 1 : 0, snapshot.winnerIndex === playerIndex ? 1 : 0];
    const deck = [snapshot.deckCount / 54];
    const tableSize = [snapshot.table.length / 12, snapshot.maxAttackCards / 12];
    return [...ownHand, ...tableAttacks, ...tableDefenses, ...playerCounts, ...phase, ...trump, ...roles, ...deck, ...tableSize];
}
export function actionIndexToMove(actionIndex, legalMoves) {
    const matched = legalMoves.find((move) => moveToActionIndex(move) === actionIndex);
    if (matched)
        return matched;
    return legalMoves[0] ?? { type: "pass" };
}
export function moveToActionIndex(move) {
    if (move.type === "attack" || move.type === "defend" || move.type === "transfer") {
        return cardActionToIndex(move.cardId ?? "");
    }
    if (move.type === "pass")
        return 54;
    if (move.type === "take")
        return 55;
    return 57;
}
function cardActionToIndex(cardId) {
    if (cardId === "joker-black")
        return 52;
    if (cardId === "joker-red")
        return 53;
    const match = /^(spades|clubs|hearts|diamonds)-(\d+)$/.exec(cardId);
    if (!match)
        return 57;
    const suitOffset = { spades: 0, clubs: 13, hearts: 26, diamonds: 39 }[match[1]];
    return suitOffset + (Number(match[2]) - 2);
}
export class DurakPolicy {
    model;
    inputSize;
    constructor(inputSize) {
        this.inputSize = inputSize;
        this.model = this.buildModel();
    }
    buildModel() {
        const model = tf.sequential();
        model.add(tf.layers.dense({ inputShape: [this.inputSize], units: 256, activation: "relu" }));
        model.add(tf.layers.dense({ units: 128, activation: "relu" }));
        model.add(tf.layers.dense({ units: ACTION_SPACE, activation: "softmax" }));
        model.compile({ optimizer: tf.train.adam(0.001), loss: "categoricalCrossentropy" });
        return model;
    }
    async choose(snapshot, playerIndex, legalMoves, epsilon = 0.1) {
        const state = encodeState(snapshot, playerIndex);
        if (legalMoves.length === 0) {
            return { actionIndex: 57, move: { type: "pass" }, confidence: 0 };
        }
        if (Math.random() < epsilon) {
            const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            return { actionIndex: moveToActionIndex(move), move, confidence: 0.1 };
        }
        const input = tf.tensor2d([state], [1, this.inputSize]);
        const logits = this.model.predict(input);
        const values = Array.from(await logits.data());
        input.dispose();
        logits.dispose();
        const masked = values.map((value, index) => (legalMoves.some((move) => moveToActionIndex(move) === index) ? value : Number.NEGATIVE_INFINITY));
        let bestIndex = 0;
        let bestValue = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < masked.length; i += 1) {
            if (masked[i] > bestValue) {
                bestValue = masked[i];
                bestIndex = i;
            }
        }
        const bestMove = actionIndexToMove(bestIndex, legalMoves);
        return { actionIndex: bestIndex, move: bestMove, confidence: Number.isFinite(bestValue) ? bestValue : 0 };
    }
    async train(experiences) {
        if (experiences.length === 0)
            return 0;
        const states = experiences.map((item) => item.state);
        const labels = experiences.map((item) => {
            const row = new Array(ACTION_SPACE).fill(0);
            row[item.actionIndex] = 1;
            return row;
        });
        const weights = experiences.map((item) => Math.max(0.1, 1 + item.reward));
        const x = tf.tensor2d(states, [states.length, this.inputSize]);
        const y = tf.tensor2d(labels, [labels.length, ACTION_SPACE]);
        const w = tf.tensor1d(weights);
        const history = await this.model.fit(x, y, { epochs: 1, batchSize: Math.min(64, experiences.length), sampleWeight: w, shuffle: true });
        x.dispose();
        y.dispose();
        w.dispose();
        return history.history.loss?.[0];
    }
    async save(modelPath) {
        const dir = dirname(modelPath);
        mkdirSync(dir, { recursive: true });
        const data = {
            inputSize: this.inputSize,
            layers: this.model.layers.map((layer) => layer.getConfig()),
            weights: await Promise.all(this.model.getWeights().map(async (weight) => ({
                shape: weight.shape,
                values: await weight.array(),
            }))),
        };
        writeFileSync(modelPath, JSON.stringify(data));
    }
    async load(modelPath) {
        try {
            const raw = readFileSync(modelPath, "utf8");
            const data = JSON.parse(raw);
            if (data.inputSize !== this.inputSize)
                return false;
            const tensors = data.weights.map((entry) => tf.tensor(entry.values, entry.shape));
            this.model.setWeights(tensors);
            tensors.forEach((tensor) => tensor.dispose());
            return true;
        }
        catch {
            return false;
        }
    }
}
