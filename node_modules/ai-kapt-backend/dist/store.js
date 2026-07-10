export class GameStore {
    games = new Map();
    add(game) {
        this.games.set(game.id, game);
        return game;
    }
    get(id) {
        return this.games.get(id);
    }
    list() {
        return [...this.games.values()].map((game) => game.getSnapshot());
    }
    remove(id) {
        this.games.delete(id);
    }
}
