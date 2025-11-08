export type Point = [number, number];

export type User = {
  id: string;     // socket id or provided
  name: string;   // display name
  color: string;  // user color
};
export type ClientOp =
  | { kind: 'stroke'; color: string; width: number; points: Point[] }
  | { kind: 'erase';  width: number; points: Point[] }
  | { kind: 'undo' }
  | { kind: 'redo' };

export type Op =
  | { id: string; user: string; t: number; kind: 'stroke'; color: string; width: number; points: Point[] }
  | { id: string; user: string; t: number; kind: 'erase';  width: number; points: Point[] }
  | { id: string; user: string; t: number; kind: 'undo' }
  | { id: string; user: string; t: number; kind: 'redo' };
