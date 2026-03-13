'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../lib/types';

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatBox({ messages, onSend, disabled = false }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.trim();
      if (!text || disabled) return;
      onSend(text);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-indigo-600 flex items-center gap-2 flex-none">
        <svg
          className="w-4 h-4 text-indigo-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">Chat &amp; Guesses</h2>
      </div>

      {/* Messages */}
      <ul
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.map((msg, i) => {
          if (msg.isSystem) {
            return (
              <li key={i} className="text-xs text-slate-400 italic text-center py-0.5 select-none">
                {msg.text}
              </li>
            );
          }

          if (msg.isCorrect) {
            return (
              <li
                key={i}
                className="flex items-start gap-1.5 bg-green-50 rounded-lg px-2 py-1"
              >
                <svg
                  className="w-4 h-4 text-green-500 mt-0.5 flex-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-bold text-green-700 break-words min-w-0">
                  <span
                    className="font-extrabold"
                    style={{ color: msg.color || '#15803d' }}
                  >
                    {msg.name}
                  </span>{' '}
                  guessed the word!
                </span>
              </li>
            );
          }

          return (
            <li key={i} className="flex items-start gap-1.5 group">
              {/* Color dot */}
              <span
                className="w-2 h-2 rounded-full mt-1.5 flex-none"
                style={{ backgroundColor: msg.color || '#94a3b8' }}
                aria-hidden="true"
              />
              <span className="text-sm break-words min-w-0 text-slate-700">
                <span
                  className="font-semibold"
                  style={{ color: msg.color || '#475569' }}
                >
                  {msg.name}:
                </span>{' '}
                {msg.text}
              </span>
            </li>
          );
        })}

        {messages.length === 0 && (
          <li className="text-xs text-slate-300 text-center py-4 italic select-none">
            No messages yet — start guessing!
          </li>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </ul>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex-none border-t border-slate-100 px-3 py-2 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type your guess…"
          maxLength={200}
          autoComplete="off"
          className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="flex-none px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}
