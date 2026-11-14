import { MODES } from './modes.mjs';

export const GAMES = [
  {
    id: 'football',
    name: MODES.football.name,
    href: '/play/football',
    players: '5 vs 5 · Up to 10 players',
    rules: 'First to 10 goals or most goals after three minutes. Ties go to golden goal.',
    options: 'Invite friends or fill the pitch with bots.',
    color: '#aad888',
  },
  {
    id: 'hockey',
    name: MODES.hockey.name,
    href: '/play/hockey',
    players: '5 vs 5 · Up to 10 players',
    rules: 'First to 7 goals or most goals after three minutes. Ties go to sudden death.',
    options: 'Invite friends or fill the rink with bots.',
    color: '#98d9f1',
  },
  {
    id: 'fighters',
    name: 'Dungeon Fighters',
    href: '/fighters',
    players: '1 vs 1 · Up to 2 players',
    rules: 'Pick a fighter and win two rounds. Use Z, X, and C to strike.',
    options: 'Challenge a friend or pick a CPU rival.',
    color: '#ff9a7b',
  },
];

export const arcadeArt = id => '/assets/arcade/' + id + '.webp';
