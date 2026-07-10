import { DurakGame } from "./engine.js";

export class GameStore {
  private games = new Map<string, DurakGame>();

  add(game: DurakGame): DurakGame {
    this.games.set(game.id, game);
    return game;
  }

  get(id: string): DurakGame | undefined {
    return this.games.get(id);
  }

  list() {
    return [...this.games.values()].map((game) => game.getSnapshot());
  }

  remove(id: string): void {
    this.games.delete(id);
  }
}
