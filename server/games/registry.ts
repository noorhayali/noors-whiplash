// Game registry. Every game plugs into the same room / lobby / socket infrastructure.
// To add a game: implement GameInstance (see rooms.ts), add it here, and add its
// host + phone screens to client/src/games/registry.tsx.
import { gameMeta, type GameId } from '../../shared/types.js';
import type { GameInstance, Room } from '../rooms.js';
import { ComedyClashGame } from './comedyClash/engine.js';
import { FibFactoryGame } from './fibFactory/engine.js';
import { DoodleDuelGame } from './doodleDuel/engine.js';
import { WhoDunnitGame } from './whoDunnit/engine.js';

export interface GameDefinition {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  create(room: Room): GameInstance;
}

export const GAMES: Record<GameId, GameDefinition> = {
  'comedy-clash': def('comedy-clash', (room) => new ComedyClashGame(room)),
  'fib-factory': def('fib-factory', (room) => new FibFactoryGame(room)),
  'doodle-duel': def('doodle-duel', (room) => new DoodleDuelGame(room)),
  'who-dunnit': def('who-dunnit', (room) => new WhoDunnitGame(room)),
};

function def(id: GameId, create: (room: Room) => GameInstance): GameDefinition {
  const m = gameMeta(id);
  return { id, name: m.name, minPlayers: m.minPlayers, maxPlayers: m.maxPlayers, create };
}
