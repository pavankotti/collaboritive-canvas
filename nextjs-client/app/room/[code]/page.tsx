import GameRoom from './GameRoom';

const DEFAULT_ROUNDS = 3;

interface Props {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ name?: string; color?: string; rounds?: string }>;
}

export default async function RoomPage({ params, searchParams }: Props) {
  const { code } = await params;
  const sp = await searchParams;

  const name   = sp.name  || 'Guest';
  const color  = sp.color || '#6366f1';
  const rounds = parseInt(sp.rounds || String(DEFAULT_ROUNDS), 10);

  return (
    <GameRoom
      roomCode={code.toUpperCase()}
      name={name}
      color={color}
      rounds={rounds}
    />
  );
}
