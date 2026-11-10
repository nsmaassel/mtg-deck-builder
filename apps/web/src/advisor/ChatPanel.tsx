import React, { useEffect, useRef, useState } from 'react';
import { advisorApi, describeError } from './api';
import type { ChatStep, StoredCollection } from './api';

interface Props {
  collection: StoredCollection | null;
  /** False when the server has no model configured: the panel explains instead of offering a dead input. */
  available: boolean;
}

interface Message {
  from: 'you' | 'advisor';
  text: string;
  steps?: ChatStep[];
}

const SUGGESTIONS = [
  'Which Standard deck am I closest to building?',
  'Where should my rare wildcards go first?',
  'What can I play instead of Steam Vents?',
];

const MAX_MESSAGE = 2000;

/**
 * A conversation with the advisor agent. The agent decides which of the
 * engine's checks to run and explains the results; the lines above each answer
 * show what it ran.
 */
export function ChatPanel({ collection, available }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy]);

  const ask = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setMessages(current => [...current, { from: 'you', text: message }]);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const turn = await advisorApi.chat(message, sessionId, collection);
      setSessionId(turn.sessionId);
      setMessages(current => [...current, { from: 'advisor', text: turn.reply, steps: turn.steps }]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel chat-panel" aria-labelledby="chat-heading">
      <div className="panel-head">
        <h2 id="chat-heading">Ask the advisor</h2>
        {messages.length > 0 && (
          <button type="button" className="btn-quiet" onClick={() => { setMessages([]); setSessionId(undefined); setError(null); }}>
            New conversation
          </button>
        )}
      </div>

      {!available ? (
        <p className="field-hint">
          Chat is off on this server: it needs a model key. Everything else on this page works without it.
        </p>
      ) : (
        <>
          <p className="chat-lede">
            An agent that runs the same checks as this page and explains them. It looks things up rather than
            guessing: the lines above each answer show what it ran.
          </p>

          {messages.length === 0 ? (
            <div className="chat-suggestions">
              {SUGGESTIONS.map(suggestion => (
                <button key={suggestion} type="button" className="btn btn-secondary" disabled={busy} onClick={() => void ask(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label="Conversation">
              {messages.map((message, i) => (
                <div key={i} className={`chat-message chat-${message.from}`}>
                  <span className="chat-author">{message.from === 'you' ? 'You' : 'Advisor'}</span>
                  {message.steps && message.steps.length > 0 && (
                    <ul className="chat-steps" aria-label="What the advisor ran">
                      {message.steps.map((step, j) => <li key={j}>{step.summary}</li>)}
                    </ul>
                  )}
                  <p className="chat-text">{message.text}</p>
                </div>
              ))}
              {busy && <p className="chat-thinking">Checking…</p>}
            </div>
          )}

          {error && <p className="inline-error" role="alert">{error}</p>}

          <form
            className="chat-form"
            onSubmit={e => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">Your question</label>
            <input
              id="chat-input"
              type="text"
              value={draft}
              maxLength={MAX_MESSAGE}
              placeholder={collection ? 'Ask about a deck, a card, or your wildcards' : 'Load a collection above for answers about your cards'}
              onChange={e => setDraft(e.target.value)}
            />
            <button type="submit" className="btn" disabled={busy || !draft.trim()}>
              {busy ? 'Asking…' : 'Ask'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
