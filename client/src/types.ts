export type Point = [number, number];

export type Op =
  | {
      id?: string;
      user?: string;
      t?: number;
      kind: 'stroke';
      color: string;
      width: number;
      points: Point[];
    }
  | {
      id?: string;
      user?: string;
      t?: number;
      kind: 'erase';
      width: number;
      points: Point[];
    }
  | { id?: string; user?: string; t?: number; kind: 'undo' }
  | { id?: string; user?: string; t?: number; kind: 'redo' };
