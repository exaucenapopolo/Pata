'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const SUGGESTIONS = [
  "Quel est mon bilan financier ?",
  "Comment mieux épargner ?",
  "Où est-ce que je dépense le plus ?",
  "Aide-moi à faire des prévisions",
];

export function AssistantChat({ open, onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erreur');
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white md:h-[80vh] md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600"><Sparkles size={16} /></div>
            <div>
              <p className="text-sm font-bold text-slate-900">Mč</p>
              <p className="text-[10px] text-slate-500">Conseils financiers personnalisés</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Bonjour {user?.displayName?.split(' ')[0] || 'toi'} 👋 Je suis Mč, ton assistant financier. Pose-moi n'importe quelle question sur ta situation.</p>
              <div className="space-y-2">
                {SUGGESTIONS.map((s, i) => (<button key={i} onClick={() => sendMessage(s)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50">{s}</button>))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{m.content}</div>
            </div>
          ))}
          {loading && (<div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600"><Loader2 size={14} className="animate-spin" /> Réflexion...</div></div>)}
          {error && (<p className="text-xs text-red-600 text-center">{error}</p>)}
        </div>

        <div className="border-t border-slate-200 p-3">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pose ta question..." className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500" disabled={loading} />
            <button type="submit" disabled={!input.trim() || loading} className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white disabled:opacity-50 hover:bg-brand-700"><Send size={16} /></button>
          </form>
        </div>
      </div>
    </div>
  );
      }
