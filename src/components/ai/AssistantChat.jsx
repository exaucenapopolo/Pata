/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, BrainCircuit, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const SUGGESTIONS = [
  "Quel est mon bilan financier ?",
  "Comment mieux épargner ?",
  "Où est-ce que je dépense le plus ?",
  "Aide-moi à faire des prévisions",
];

// Composant pour formater le texte proprement (gérer les sauts de ligne et les tirets)
function MessageContent({ text }) {
  if (!text) return null;
  
  // Découper par ligne
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-2" />; // Espace vide
        
        // Si la ligne commence par un tiret (liste)
        if (trimmed.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0 text-brand-600 font-bold mt-0.5">•</span>
              <span>{trimmed.substring(2)}</span>
            </div>
          );
        }

        // Texte normal
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

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
      <div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white md:h-[80vh] md:rounded-2xl shadow-2xl">
        
        <div className="flex items-center justify-between border-b border-slate-100 p-4 bg-slate-50/50 rounded-t-3xl md:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <BrainCircuit size={22} />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Mč</p>
              <p className="text-[11px] text-slate-500 font-medium">Assistante financière</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          {messages.length === 0 && (
            <div className="space-y-4 mt-4">
              <div className="text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
                  <BrainCircuit size={32} />
                </div>
                <p className="text-sm text-slate-600 px-4">
                  Bonjour {user?.displayName?.split(' ')[0] || 'toi'}. Je suis Mč, ton assistante financière. Pose-moi n’importe quelle question sur ta situation.
                </p>
              </div>
              <div className="space-y-2 mt-6">
                {SUGGESTIONS.map((s, i) => (
                  <button 
                    key={i} 
                    onClick={() => sendMessage(s)} 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-brand-600 text-white rounded-br-sm' 
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              }`}>
                {m.role === 'user' ? m.content : <MessageContent text={m.content} />}
              </div>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
                <Loader2 size={16} className="text-brand-600 animate-spin" />
                <span className="text-[13px] text-slate-600 font-medium">Mč analyse vos données...</span>
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          
          {error && (<p className="text-xs text-red-600 text-center bg-red-50 py-2 rounded-lg">{error}</p>)}
        </div>

        <div className="border-t border-slate-100 p-3 bg-white rounded-b-3xl md:rounded-b-2xl">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Pose ta question..." 
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white transition-colors" 
              disabled={loading} 
            />
            <button 
              type="submit" 
              disabled={!input.trim() || loading} 
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50 hover:bg-brand-700 transition-colors shadow-sm"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
