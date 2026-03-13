import type { GameState, PlayerScore, User } from './types';

// ─── Word list ────────────────────────────────────────────────────────────────

export const WORDS: string[] = [
  'apple', 'banana', 'cat', 'dog', 'elephant', 'fish', 'guitar', 'house',
  'island', 'jacket', 'kite', 'lamp', 'mountain', 'notebook', 'ocean',
  'piano', 'rainbow', 'sun', 'tree', 'umbrella', 'violin', 'waterfall',
  'zebra', 'airplane', 'balloon', 'castle', 'dragon', 'eagle', 'flower',
  'ghost', 'hammer', 'igloo', 'jungle', 'keyboard', 'lighthouse', 'moon',
  'ninja', 'owl', 'penguin', 'robot', 'spaceship', 'tornado', 'unicorn',
  'volcano', 'wizard', 'anchor', 'bridge', 'cloud', 'diamond', 'egg',
  'fork', 'glasses', 'helicopter', 'iron', 'jellyfish', 'kangaroo',
  'ladder', 'magnet', 'noodle', 'orange', 'potato', 'rocket', 'sandwich',
  'taxi', 'vase', 'window', 'pizza', 'burger', 'cookie', 'donut',
  'ice cream', 'popcorn', 'sushi', 'taco', 'waffle', 'chocolate',
  'camera', 'compass', 'crown', 'dice', 'flag', 'globe', 'medal',
  'mirror', 'trophy', 'clock', 'book', 'candle', 'chair', 'hat',
  'map', 'pencil', 'phone', 'ring', 'shoe', 'star', 'sword', 'wheel',
  'boat', 'bus', 'car', 'train', 'truck', 'submarine', 'cactus',
  'coconut', 'mushroom', 'sunflower', 'butterfly', 'shark', 'tiger',
  'parrot', 'crab', 'snowman', 'campfire', 'rainbow', 'tornado', 'storm',
  'treasure', 'pirate', 'mermaid', 'alien', 'robot', 'superhero',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return `count` unique random words from the word list. */
export function pickWords(count: number): string[] {
  const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Mask a word for guessers: letters become `_`, spaces remain.
 * Each character is separated by a space for readability.
 * e.g. "ice cream" → "_ _ _   _ _ _ _ _"
 */
export function maskWord(word: string): string {
  return word
    .split('')
    .map(c => (c === ' ' ? '  ' : '_'))
    .join(' ');
}

/** How many guessers got it right (status === 'guessed', excluding drawer). */
export function correctCount(state: GameState): number {
  return state.players.filter(
    p => p.id !== state.drawerId && p.status === 'guessed',
  ).length;
}

/** Total guessers (everyone except the drawer). */
export function guesserCount(state: GameState): number {
  return state.players.filter(p => p.id !== state.drawerId).length;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createGameState(users: User[], totalRounds: number, firstDrawerId: string): GameState {
  const players: PlayerScore[] = users.map(u => ({
    id: u.id,
    name: u.name,
    color: u.color,
    score: 0,
    status: u.id === firstDrawerId ? 'drawing' : 'waiting',
    hasDrawnThisRound: false,
  }));

  return {
    phase: 'STARTING',
    round: 1,
    totalRounds,
    drawerId: firstDrawerId,
    wordMasked: '',
    timeLeft: 15, // word-selection countdown
    players,
  };
}
