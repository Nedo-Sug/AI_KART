export type Suit = "spades" | "clubs" | "hearts" | "diamonds";
export type Color = "black" | "red";

export type CardKind = "standard" | "joker";

export interface Card {
  id: string;
  kind: CardKind;
  label: string;
  suit?: Suit;
  rank: number;
  color: Color;
}

export type GameMode = "podkidnoy" | "perevodnoy";

export type GamePhase = "attack" | "defend" | "finished";

export type MoveType = "attack" | "defend" | "pass" | "take" | "transfer";

export interface Move {
  type: MoveType;
  cardId?: string;
  attackIndex?: number;
}

export interface TableEntry {
  attack: Card;
  defense?: Card;
  attackerIndex: number;
}

export interface PlayerState {
  id: number;
  name: string;
  hand: Card[];
  isHuman?: boolean;
  score: number;
}

export interface GameSnapshot {
  id: string;
  mode: GameMode;
  phase: GamePhase;
  players: Array<{
    id: number;
    name: string;
    handCount: number;
    hand?: Card[];
    isHuman?: boolean;
    score: number;
  }>;
  table: TableEntry[];
  deckCount: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  attackerIndex: number;
  defenderIndex: number;
  turnIndex: number;
  maxAttackCards: number;
  log: string[];
  winnerIndex: number | null;
}

export interface TrainingConfig {
  mode: GameMode | "mixed";
  parallelGames: number;
  epsilon: number;
  learningRate: number;
}

export interface TrainingSnapshot {
  running: boolean;
  config: TrainingConfig;
  gamesRunning: number;
  totalGames: number;
  completedGames: number;
  wins: number[];
  losses: number[];
  averageReward: number;
  lastUpdate: string | null;
}
