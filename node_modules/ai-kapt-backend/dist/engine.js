import { randomUUID } from "node:crypto";
const SUITS = ["spades", "clubs", "hearts", "diamonds"];
const SUIT_COLORS = {
    spades: "black",
    clubs: "black",
    hearts: "red",
    diamonds: "red",
};
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
function rankLabel(rank) {
    if (rank === 11)
        return "J";
    if (rank === 12)
        return "Q";
    if (rank === 13)
        return "K";
    if (rank === 14)
        return "A";
    return String(rank);
}
function suitLabel(suit) {
    switch (suit) {
        case "spades":
            return "♠";
        case "clubs":
            return "♣";
        case "hearts":
            return "♥";
        case "diamonds":
            return "♦";
    }
}
export function createDeck() {
    const standardCards = SUITS.flatMap((suit) => RANKS.map((rank) => ({
        id: `${suit}-${rank}`,
        kind: "standard",
        suit,
        rank,
        color: SUIT_COLORS[suit],
        label: `${rankLabel(rank)}${suitLabel(suit)}`,
    })));
    const jokers = [
        {
            id: "joker-black",
            kind: "joker",
            rank: 20,
            color: "black",
            label: "Joker B",
        },
        {
            id: "joker-red",
            kind: "joker",
            rank: 20,
            color: "red",
            label: "Joker R",
        },
    ];
    return shuffled([...standardCards, ...jokers]);
}
function nextPlayerIndex(index, players) {
    if (players.length === 0)
        return 0;
    return (index + 1) % players.length;
}
function sameColor(a, b) {
    return a.color === b.color;
}
function beats(defense, attack, trumpSuit) {
    if (defense.kind === "joker") {
        if (attack.kind === "joker")
            return false;
        return sameColor(defense, attack);
    }
    if (attack.kind === "joker") {
        return false;
    }
    const defenseIsTrump = trumpSuit && defense.suit === trumpSuit;
    const attackIsTrump = trumpSuit && attack.suit === trumpSuit;
    if (defense.suit === attack.suit && defense.rank > attack.rank)
        return true;
    if (defenseIsTrump && !attackIsTrump)
        return true;
    return false;
}
function canAttackWith(card, table, handSize) {
    if (card.kind === "joker") {
        return handSize === 1;
    }
    if (table.length === 0)
        return true;
    const ranksOnTable = new Set(table.flatMap((entry) => [entry.attack.rank, entry.defense?.rank].filter((x) => typeof x === "number")));
    return ranksOnTable.has(card.rank);
}
function canTransferWith(card, table) {
    if (card.kind === "joker")
        return false;
    const latestAttack = table.at(-1)?.attack;
    if (!latestAttack)
        return false;
    return card.rank === latestAttack.rank;
}
function visibleCards(table) {
    const cards = [];
    for (const entry of table) {
        cards.push(entry.attack);
        if (entry.defense)
            cards.push(entry.defense);
    }
    return cards;
}
export class DurakGame {
    id = randomUUID();
    mode;
    players;
    deck;
    discard = [];
    table = [];
    trumpCard = null;
    trumpSuit = null;
    phase = "attack";
    attackerIndex = 0;
    defenderIndex = 1;
    turnIndex = 0;
    maxAttackCards = 6;
    consecutivePasses = 0;
    winnerIndex = null;
    log = [];
    constructor(mode, players, deck) {
        this.mode = mode;
        this.players = players;
        this.deck = deck ?? createDeck();
        this.setupGame();
    }
    static create(mode, playerCount = 4, humanSlots = []) {
        const deck = createDeck();
        const players = Array.from({ length: playerCount }, (_, index) => ({
            id: index,
            name: `Player ${index + 1}`,
            hand: [],
            isHuman: humanSlots.includes(index),
            score: 0,
        }));
        return new DurakGame(mode, players, deck);
    }
    setupGame() {
        const trumpIndex = [...this.deck].reverse().findIndex((card) => card.kind === "standard");
        const resolvedTrumpIndex = trumpIndex < 0 ? this.deck.length - 1 : this.deck.length - 1 - trumpIndex;
        this.trumpCard = this.deck.splice(resolvedTrumpIndex, 1)[0] ?? null;
        this.trumpSuit = this.trumpCard?.kind === "standard" ? this.trumpCard.suit ?? null : this.deck.find((card) => card.kind === "standard")?.suit ?? null;
        for (let draw = 0; draw < 6; draw += 1) {
            for (const player of this.players) {
                const card = this.deck.shift();
                if (card)
                    player.hand.push(card);
            }
        }
        this.attackerIndex = this.findOpeningAttacker();
        this.defenderIndex = nextPlayerIndex(this.attackerIndex, this.players);
        this.turnIndex = this.attackerIndex;
        this.maxAttackCards = Math.max(1, this.players[this.defenderIndex]?.hand.length ?? 6);
        this.log.push(`Game ${this.id} started in ${this.mode} mode`);
        this.log.push(`Trump: ${this.trumpCard?.label ?? "none"}`);
    }
    findOpeningAttacker() {
        if (!this.trumpSuit)
            return 0;
        let bestIndex = 0;
        let bestCard = null;
        for (const player of this.players) {
            const trumpCards = player.hand.filter((card) => card.kind === "standard" && card.suit === this.trumpSuit);
            const lowestTrump = trumpCards.sort((a, b) => a.rank - b.rank)[0];
            if (!bestCard && lowestTrump) {
                bestCard = lowestTrump;
                bestIndex = player.id;
            }
            else if (lowestTrump && bestCard && lowestTrump.rank < bestCard.rank) {
                bestCard = lowestTrump;
                bestIndex = player.id;
            }
        }
        return bestCard ? bestIndex : Math.floor(Math.random() * this.players.length);
    }
    getSnapshot(viewerIndex = null, options) {
        const revealAll = options?.revealAll ?? false;
        const includeHumanHands = options?.includeHumanHands ?? true;
        return {
            id: this.id,
            mode: this.mode,
            phase: this.phase,
            players: this.players.map((player) => ({
                id: player.id,
                name: player.name,
                handCount: player.hand.length,
                hand: revealAll || player.id === viewerIndex || (includeHumanHands && player.isHuman) ? [...player.hand] : undefined,
                isHuman: player.isHuman,
                score: player.score,
            })),
            table: this.table.map((entry) => ({ ...entry })),
            deckCount: this.deck.length,
            trumpCard: this.trumpCard ? { ...this.trumpCard } : null,
            trumpSuit: this.trumpSuit,
            attackerIndex: this.attackerIndex,
            defenderIndex: this.defenderIndex,
            turnIndex: this.turnIndex,
            maxAttackCards: this.maxAttackCards,
            log: [...this.log].slice(-50),
            winnerIndex: this.winnerIndex,
        };
    }
    getLegalMoves(playerIndex) {
        if (this.phase === "finished" || playerIndex !== this.turnIndex) {
            return [];
        }
        const player = this.players[playerIndex];
        if (!player)
            return [];
        if (this.phase === "attack") {
            const attacks = player.hand
                .filter((card) => this.table.length < this.maxAttackCards && canAttackWith(card, this.table, player.hand.length))
                .map((card) => ({ type: "attack", cardId: card.id }));
            const canPass = this.table.length > 0;
            return canPass ? [...attacks, { type: "pass" }] : attacks;
        }
        const moves = [];
        const attackEntry = this.table[this.table.length - 1];
        if (playerIndex === this.defenderIndex && attackEntry) {
            for (const card of player.hand) {
                if (beats(card, attackEntry.attack, this.trumpSuit)) {
                    moves.push({ type: "defend", cardId: card.id, attackIndex: this.table.length - 1 });
                }
                if (this.mode === "perevodnoy" && canTransferWith(card, this.table)) {
                    moves.push({ type: "transfer", cardId: card.id });
                }
            }
            moves.push({ type: "take" });
        }
        return moves;
    }
    applyMove(move) {
        if (this.phase === "finished") {
            return { ok: false, reason: "game finished" };
        }
        const player = this.players[this.turnIndex];
        if (!player)
            return { ok: false, reason: "invalid turn" };
        const legalMoves = this.getLegalMoves(this.turnIndex);
        const isLegal = legalMoves.some((candidate) => candidate.type === move.type && candidate.cardId === move.cardId && candidate.attackIndex === move.attackIndex);
        if (!isLegal) {
            return { ok: false, reason: "illegal move" };
        }
        player.score += 1;
        this.log.push(`${player.name} scored 1 point`);
        if (move.type === "pass") {
            this.consecutivePasses += 1;
            this.turnIndex = nextAttackTurn(this.turnIndex, this.defenderIndex, this.players);
            if (this.consecutivePasses >= countAttackers(this.defenderIndex, this.players) && this.table.length > 0) {
                this.phase = "defend";
                this.turnIndex = this.defenderIndex;
            }
            this.log.push(`${player.name} passed`);
            return this.finishIfNeeded();
        }
        if (move.type === "attack") {
            const card = takeCardFromHand(player, move.cardId);
            if (!card)
                return { ok: false, reason: "card not found" };
            this.table.push({ attack: card, attackerIndex: this.turnIndex });
            this.consecutivePasses = 0;
            this.turnIndex = nextAttackTurn(this.turnIndex, this.defenderIndex, this.players);
            this.log.push(`${player.name} attacked with ${card.label}`);
            if (this.table.length >= this.maxAttackCards) {
                this.phase = "defend";
                this.turnIndex = this.defenderIndex;
            }
            return this.finishIfNeeded();
        }
        if (move.type === "defend") {
            const card = takeCardFromHand(player, move.cardId);
            if (!card)
                return { ok: false, reason: "card not found" };
            const attackIndex = move.attackIndex ?? this.table.length - 1;
            const target = this.table[attackIndex];
            if (!target || !beats(card, target.attack, this.trumpSuit)) {
                player.hand.push(card);
                return { ok: false, reason: "cannot beat attack" };
            }
            target.defense = card;
            this.log.push(`${player.name} defended ${target.attack.label} with ${card.label}`);
            if (this.table.every((entry) => entry.defense)) {
                this.resolveRound(true);
            }
            return this.finishIfNeeded();
        }
        if (move.type === "transfer") {
            const card = takeCardFromHand(player, move.cardId);
            if (!card)
                return { ok: false, reason: "card not found" };
            if (!canTransferWith(card, this.table)) {
                player.hand.push(card);
                return { ok: false, reason: "cannot transfer" };
            }
            this.table.push({ attack: card, attackerIndex: this.turnIndex });
            this.defenderIndex = nextPlayerIndex(this.defenderIndex, this.players);
            this.turnIndex = this.defenderIndex;
            this.maxAttackCards = Math.max(this.maxAttackCards, this.players[this.defenderIndex]?.hand.length ?? this.maxAttackCards);
            this.log.push(`${player.name} transferred with ${card.label}`);
            return this.finishIfNeeded();
        }
        if (move.type === "take") {
            const taken = visibleCards(this.table);
            player.hand.push(...taken);
            this.log.push(`${player.name} took ${taken.length} cards`);
            this.resolveRound(false);
            return this.finishIfNeeded();
        }
        return { ok: false, reason: "unsupported move" };
    }
    resolveRound(successfulDefense) {
        if (successfulDefense) {
            this.discard.push(...visibleCards(this.table));
            this.table = [];
            this.replenishHands();
            this.attackerIndex = nextActivePlayer(this.defenderIndex, this.players);
            this.defenderIndex = nextActivePlayer(this.attackerIndex, this.players);
            this.turnIndex = this.attackerIndex;
            this.phase = "attack";
            this.maxAttackCards = Math.max(1, this.players[this.defenderIndex]?.hand.length ?? 1);
            this.consecutivePasses = 0;
            return;
        }
        this.discard = this.discard.concat(visibleCards(this.table));
        this.table = [];
        this.replenishHands();
        this.defenderIndex = nextActivePlayer(this.defenderIndex, this.players);
        this.turnIndex = this.attackerIndex;
        this.phase = "attack";
        this.maxAttackCards = Math.max(1, this.players[this.defenderIndex]?.hand.length ?? 1);
        this.consecutivePasses = 0;
    }
    replenishHands() {
        const order = [this.attackerIndex, ...this.players.map((_, index) => index).filter((index) => index !== this.attackerIndex)];
        for (const index of order) {
            const player = this.players[index];
            while (player.hand.length < 6 && this.deck.length > 0) {
                const card = this.deck.shift();
                if (card)
                    player.hand.push(card);
            }
        }
    }
    finishIfNeeded() {
        const activePlayers = this.players.filter((player) => player.hand.length > 0);
        if (this.deck.length === 0 && activePlayers.length <= 1) {
            this.phase = "finished";
            this.winnerIndex = activePlayers[0]?.id ?? null;
            this.turnIndex = this.winnerIndex ?? this.turnIndex;
            this.log.push(this.winnerIndex === null ? "Game ended in draw" : `Winner: ${this.players[this.winnerIndex]?.name ?? this.winnerIndex}`);
        }
        return { ok: true };
    }
    setHuman(index) {
        if (this.players[index]) {
            this.players[index].isHuman = true;
        }
    }
}
function takeCardFromHand(player, cardId) {
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index < 0)
        return null;
    return player.hand.splice(index, 1)[0] ?? null;
}
function countAttackers(defenderIndex, players) {
    return Math.max(1, players.filter((player, index) => index !== defenderIndex && player.hand.length > 0).length);
}
function nextAttackTurn(index, defenderIndex, players) {
    let next = nextPlayerIndex(index, players);
    const start = next;
    while (next === defenderIndex || players[next]?.hand.length === 0) {
        next = nextPlayerIndex(next, players);
        if (next === start)
            break;
    }
    return next;
}
function nextActivePlayer(index, players) {
    let next = nextPlayerIndex(index, players);
    const start = next;
    while (players[next]?.hand.length === 0) {
        next = nextPlayerIndex(next, players);
        if (next === start)
            break;
    }
    return next;
}
