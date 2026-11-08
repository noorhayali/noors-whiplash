// Types shared by the server and both client interfaces (host screen + phone controller).

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const AVATAR_COUNT = 12;
export const MAX_NAME = 14;
export const MAX_ANSWER = 80;
export const REGULAR_ROUNDS = 3;
export const FINAL_ROUND = 4;

export type GameId = 'comedy-clash';

export type Phase =
  | 'lobby'
  | 'intro'
  | 'roundIntro'
  | 'writing'
  | 'reveal'
  | 'vote'
  | 'matchupResult'
  | 'scoreboard'
  | 'finalIntro'
  | 'finalWriting'
  | 'finalVote'
  | 'finalResult'
  | 'gameOver';

export interface Settings {
  writingSeconds: number; // default 60
  spicy: boolean; // 18+ deck (default) vs family deck
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  score: number;
  connected: boolean;
  isVip: boolean;
}

export interface TimerView {
  deadline: number; // server epoch ms
  duration: number; // ms
}

export interface AnswerView {
  key: string;
  text: string | null; // null = player never answered
  authorId: string | null; // hidden (null) until the result phase
  votes: number | null; // hidden until the result phase
  points: number | null; // hidden until the result phase
  sweep?: boolean;
}

export interface MatchupView {
  index: number; // 0-based position among played matchups
  count: number;
  prompt: string;
  answers: AnswerView[];
  voted: number;
  eligible: number;
  forfeit: boolean;
  pool: number;
}

export interface FinalView {
  prompt: string;
  answers: AnswerView[];
  voted: number;
  eligible: number;
  pool: number;
}

export interface Award {
  title: string;
  blurb: string;
  playerId: string;
}

export interface ResultsView {
  ranking: { id: string; rank: number; score: number }[];
  winnerIds: string[];
  winnerTitle: string;
  awards: Award[];
}

export interface HostView {
  role: 'host';
  code: string;
  gameId: GameId;
  phase: Phase;
  round: number; // 0 = lobby, 1..3 regular, 4 = final
  totalRounds: number;
  players: PublicPlayer[];
  settings: Settings;
  timer: TimerView | null;
  serverNow: number;
  paused: boolean;
  canStart: boolean;
  multiplier: number;
  writing?: { done: string[]; total: number };
  matchup?: MatchupView;
  final?: FinalView;
  gains?: Record<string, number>;
  prevScores?: Record<string, number>;
  results?: ResultsView;
}

export interface PlayerPromptView {
  id: string;
  text: string;
  answer: string | null;
}

export interface VoteOption {
  key: string;
  text: string;
  mine: boolean;
}

export interface PlayerView {
  role: 'player';
  code: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  me: PublicPlayer & { rank: number };
  players: PublicPlayer[];
  hostConnected: boolean;
  paused: boolean;
  timer: TimerView | null;
  serverNow: number;
  canStart: boolean;
  multiplier: number;
  writing?: { prompts: PlayerPromptView[] };
  vote?: {
    prompt: string;
    options: VoteOption[];
    canVote: boolean;
    votedFor: string | null;
    reason?: 'author' | 'noAnswers';
  };
  lastGain?: number;
  results?: ResultsView;
}

export type GameView = HostView | PlayerView;

export type PlayerAction =
  | { type: 'submit'; promptId: string; text: string }
  | { type: 'vote'; choice: string };

export interface Ack<T = {}> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface PeekResult {
  code: string;
  gameId: GameId;
  phase: Phase;
  playerCount: number;
  takenAvatars: number[];
  joinable: boolean;
  spicy: boolean;
}
