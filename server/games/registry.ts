// Game registry. Every game plugs into the same room / lobby / socket infrastructure.
// To add a game: implement GameInstance (see rooms.ts), add it here, and add its
// host + phone screens to client/src/games/registry.tsx.
import type { GameId } from '../../shared/types.js';
import type { GameInstance, Room } from '../rooms.js';
import { ComedyClashGame } from './comedyClash/engine.js';

export interface GameDefinition {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  create(room: Room): GameInstance;
}

export const GAMES: Record<GameId, GameDefinition> = {
  'comedy-clash': {
    id: 'comedy-clash',
    name: 'Noor’s Whiplash',
    minPlayers: 3,
    maxPlayers: 10,
    create: (room) => new ComedyClashGame(room),
  },
};
