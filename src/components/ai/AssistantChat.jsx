/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, BrainCircuit, Loader2, Play, Plus, MessageSquare, Volume2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeChats, createChat, updateChatMessages } from '@/lib/firestore/ai_chats';
import { createExpense } from '@/lib/firestore/expenses';
import { createGoal } from '@/lib/firestore/goals';
import { createAutomation } from '@/lib/firestore/automations';

const SUGGESTIONS = [
  "Quel est mon bilan financier ?",
  "Comment mieux épargner ?",
  "Où est-ce que je dépense le plus ?",
  "Ajoute une dépense de 2000 FCFA pour le transport",
  "Crée un objectif d'épargne de 50 000 FCFA pour Noël",
  "Programme 500 FCFA de transport chaque jour",
  "Explique-moi en audio comment épargner" // 🟢 Suggestion audio
];

// 🟢 Composant pour formater le texte proprement (nettoyage des ** et sauts de ligne)
function MessageContent({ text }) {
  if (!text) return null;
  
  // Nettoyage de sécurité : on retire les ** et les # s'il en reste
  const cleanText = text.replace(/\*\*/g, '').replace(/#/g, '');
  const lines = cleanText.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-2" />;
        
        // Si la ligne commence par un tiret (liste)
        if (trimmed.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0 text-brand-600 font-bold mt-0.5">•</span>
              <span className="flex-1">{trimmed.substring(2)}</span>
            </div>
          );
        }

        // Texte normal
        return <p key={index} className="leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export function AssistantChat({ open, onClose }) {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    return subscribeChats(user.uid, setChats);
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const loadChat = (chat) => {
    setActiveChatId(chat.id);
    setMessages(chat.messages || []);
    setShowHistory(false);
  };

  const executeToolCall = async (toolCall) => {
    try {
      const { name, arguments: argsStr } = toolCall;
      const args = JSON.parse(argsStr);
      
      if (name === 'add_expense') {
        await createExpense(user.uid, {
          amount: args.amount,
          categoryId: args.category || 'other',
          note: args.note || 'Ajouté par Mč',
          date: new Date().toISOString().slice(0, 10),
          incomeSourceId: 'all',
          incomeSourceName: 'Tous les revenus',
        });
        return `C'est fait ! J'ai bien enregistré ta dépense de ${args.amount} FCFA pour ${args.note || args.category}.`;
      }
      
      if (name === 'create_goal') {
        await createGoal(user.uid, {
          name: args.name,
          targetAmount: args.targetAmount,
          categoryId: 'savings',
          startDate: new Date().toISOString().slice(0, 10),
          deadline: args.deadline,
          frequencyDays: 7,
          penaltyAmount: 700,
        });
        return `J'ai créé ton objectif "${args.name}" de ${args.targetAmount} FCFA pour le ${args.deadline}.`;
      }

      if (name === 'add_automation') {
        const nextRun = new Date();
        if (args.frequency === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        if (args.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        if (args.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);
        
        await createAutomation(user.uid, {
          amount: args.amount,
          categoryId: args.category || 'other',
          note: args.note,
          frequency: args.frequency,
          nextRun: nextRun.toISOString(),
        });
        return `C'est noté ! J'enregistrerai automatiquement ${args.amount} FCFA pour ${args.note} chaque ${args.frequency === 'daily' ? 'jour' : args.frequency === 'weekly' ? 'semaine' : 'mois'}.`;
      }

      return "Action effectuée avec succès.";
    } catch (e) {
      console.error(e);
      return "J'ai eu un problème pour exécuter cette action.";
    }
  };

  const playAudio = async (text) => {
    if (audioLoading) return;
    setAudioLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
        audio.play();
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération de l'audio.");
    } finally {
      setAudioLoading(false);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      
      let finalReply = data.reply;
      
      // Gestion des actions (Function calling)
      try {
        const parsed = JSON.parse(data.reply);
        if (parsed.tool_call) {
          const toolResult = await executeToolCall(parsed.tool_call);
          finalReply = toolResult;
        }
      } catch (e) {
        // Pas un tool call
      }

      const botMsg = { role: 'assistant', content: finalReply };
      const updatedMessages = [...newMessages, botMsg];
      setMessages(updatedMessages);

      // 🟢 DÉTECTION AUTOMATIQUE DE L'AUDIO
      // Si l'utilisateur a demandé du son, on lance la lecture
      const wantsAudio = /audio|voix|vocal|parle/i.test(text);
      if (wantsAudio) {
        playAudio(finalReply);
      }

      // Sauvegarde dans Firestore
      if (activeChatId) {
        await updateChatMessages(user.uid, activeChatId, updatedMessages);
      } else {
        const newChatRef = await createChat(user.uid, text);
        setActiveChatId(newChatRef.id);
        await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
      }

    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: "Désolée, j'ai eu une erreur technique." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white md:h-[80vh] md:rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHistory(!showHistory)} className="p-1.5 rounded-lg hover:bg-slate-200">
              <MessageSquare size={18} className="text-slate-500" />
            </button>
            <div>
              <p className="text-base font-bold text-slate-900">Mč</p>
              <p className="text-[11px] text-slate-500 font-medium">Assistante financière</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={startNewChat} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50" title="Nouvelle conversation">
              <Plus size={18} />
            </button>
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Historique des chats (Sidebar) */}
        {showHistory && (
          <div className="absolute inset-0 z-10 bg-white p-4 overflow-y-auto">
            <h3 className="font-bold mb-4">Historique</h3>
            {chats.map(c => (
              <button key={c.id} onClick={() => loadChat(c)} className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border mb-2 text-sm truncate">
                {c.title}
              </button>
            ))}
          </div>
        )}

        {/* Chat Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          {messages.length === 0 && (
             <div className="space-y-4 mt-4">
               <div className="text-center">
                 <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
                   <BrainCircuit size={32} />
                 </div>
                 <p className="text-sm text-slate-600 px-4">
                   Bonjour {user?.displayName?.split(' ')[0] || 'toi'}. Je suis Mč, ton assistante financière.
                 </p>
               </div>
               <div className="space-y-2 mt-6">
                 {SUGGESTIONS.map((s, i) => (
                   <button 
                     key={i} 
                     onClick={() => sendMessage(s)} 
                     className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-[13px] text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                   >
                     {s}
                   </button>
                 ))}
               </div>
             </div>
          )}
          
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] ${
                m.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              }`}>
                {m.role === 'user' ? m.content : <MessageContent text={m.content} />}
              </div>
              {m.role === 'assistant' && (
                <button onClick={() => playAudio(m.content)} className="mt-1 flex items-center gap-1 text-[10px] text-brand-600 hover:underline px-1">
                  {audioLoading ? <Loader2 size={10} className="animate-spin" /> : <Volume2 size={10} />} Écouter
                </button>
              )}
            </div>
          ))}
          {loading && (
             <div className="flex items-start gap-2 bg-slate-100 w-fit px-4 py-2 rounded-2xl rounded-bl-sm">
               <Loader2 size={14} className="animate-spin text-brand-600" />
               <span className="text-xs text-slate-600">Mč réfléchit...</span>
             </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 p-3 bg-white">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <input 
              type="text" value={input} onChange={(e) => setInput(e.target.value)} 
              placeholder="Pose ta question ou demande une action..." 
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white" 
              disabled={loading} 
            />
            <button type="submit" disabled={!input.trim() || loading} className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50">
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
  }
