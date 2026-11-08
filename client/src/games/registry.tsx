// Client-side game registry. Whiplash (comedy-clash) has its own screens in host/ and player/;
// newer games plug in here with a TV component, a phone component and a stage colour.
import type { ReactElement } from 'react';
import type { GameId, HostView, PlayerView } from '../../../shared/types';
import type { Theme } from '../components/ui';
import { DoodleHost, DoodlePhone } from './doodle';
import { FibHost, FibPhone } from './fib';
import { WhoHost, WhoPhone } from './who';

export interface GameScreens {
  Host: (p: { v: HostView }) => ReactElement | null;
  Phone: (p: { v: PlayerView }) => ReactElement | null;
  theme: Theme;
  scoreTitle: (v: HostView) => string;
}

export const SCREENS: Partial<Record<GameId, GameScreens>> = {
  'fib-factory': { Host: FibHost, Phone: FibPhone, theme: 'fib', scoreTitle: (v) => `After question ${v.round} of ${v.totalRounds}` },
  'doodle-duel': { Host: DoodleHost, Phone: DoodlePhone, theme: 'doodle', scoreTitle: () => 'Final drawing scores' },
  'who-dunnit': { Host: WhoHost, Phone: WhoPhone, theme: 'who', scoreTitle: (v) => `After round ${v.round} of ${v.totalRounds}` },
};
