'use client';

import type { ReactElement } from 'react';

interface ToolbarProps {
  activeTool: 'brush' | 'erase' | 'fill';
  activeColor: string;
  brushWidth: number;
  disabled: boolean;
  onToolChange: (tool: 'brush' | 'erase' | 'fill') => void;
  onColorChange: (color: string) => void;
  onWidthChange: (w: number) => void;
  onClear: () => void;
}

const COLORS = [
  { hex: '#1e293b', label: 'Black' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#a855f7', label: 'Purple' },
];

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L3.5 15.5a2 2 0 010-2.828L13 3.172a2 2 0 012.828 0l3.5 3.5a2 2 0 010 2.828L9.828 19.5A2 2 0 018.5 20H6v-2z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    </svg>
  );
}

function BucketIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export default function Toolbar({
  activeTool,
  activeColor,
  brushWidth,
  disabled,
  onToolChange,
  onColorChange,
  onWidthChange,
  onClear,
}: ToolbarProps) {
  const btnBase =
    'w-10 h-10 rounded-xl flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed';

  const toolActive = 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400 shadow-inner';
  const toolInactive = 'text-slate-600 hover:bg-slate-100';

  const tools: { id: 'brush' | 'erase' | 'fill'; Icon: () => ReactElement; label: string }[] = [
    { id: 'brush', Icon: PencilIcon, label: 'Pencil' },
    { id: 'erase', Icon: EraserIcon, label: 'Eraser' },
    { id: 'fill', Icon: BucketIcon, label: 'Fill bucket' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-lg p-3 flex flex-col items-center gap-2 select-none self-start">
      {/* Tool buttons */}
      {tools.map(({ id, Icon, label }) => (
        <button
          key={id}
          title={label}
          aria-label={label}
          aria-pressed={activeTool === id}
          disabled={disabled}
          onClick={() => onToolChange(id)}
          className={`${btnBase} ${activeTool === id ? toolActive : toolInactive}`}
        >
          <Icon />
        </button>
      ))}

      {/* Clear / trash */}
      <button
        title="Clear canvas"
        aria-label="Clear canvas"
        disabled={disabled}
        onClick={onClear}
        className={`${btnBase} text-red-500 hover:bg-red-50 hover:text-red-600`}
      >
        <TrashIcon />
      </button>

      {/* Divider */}
      <div className="w-full h-px bg-slate-200 my-0.5" />

      {/* Color swatches — 2-col grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {COLORS.map(({ hex, label }) => (
          <button
            key={hex}
            title={label}
            aria-label={`Color: ${label}`}
            aria-pressed={activeColor === hex}
            disabled={disabled}
            onClick={() => onColorChange(hex)}
            style={{ backgroundColor: hex }}
            className={[
              'w-7 h-7 rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-500 disabled:opacity-40 disabled:cursor-not-allowed',
              activeColor === hex ? 'ring-2 ring-offset-1 ring-slate-800 scale-110 shadow-md' : '',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-slate-200 my-0.5" />

      {/* Vertical brush-size slider */}
      <div className="flex flex-col items-center gap-1 py-1">
        <span className="text-xs text-slate-400 font-medium">Size</span>
        <div
          style={{ height: '88px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <input
            type="range"
            min={1}
            max={32}
            step={1}
            value={brushWidth}
            disabled={disabled}
            aria-label="Brush size"
            onChange={(e) => onWidthChange(Number(e.target.value))}
            style={{
              writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
              direction: 'rtl' as React.CSSProperties['direction'],
              height: '80px',
              width: '20px',
              accentColor: '#4f46e5',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
            }}
          />
        </div>
        <span className="text-xs font-mono text-slate-600 tabular-nums">{brushWidth}px</span>
      </div>
    </div>
  );
}
