/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, BrainCircuit, Loader2, Plus, MessageSquare, Image as ImageIcon, Volume2, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeChats, createChat, updateChatMessages, deleteChat } from '@/lib/firestore/ai_chats';
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
  "Fais-moi mon bilan en audio"
];

function MessageContent({ text }) {
  if (!text) return null;
  const cleanText = text.replace(/\*\*/g, '').replace(/#/g, '');
  const lines = cleanText.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-2" />;
        
        if (trimmed.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2 pl-1">
              <span className="shrink-0 text-brand-600 font-bold mt-0.5">•</span>
              <span className="flex-1">{trimmed.substring(2)}</span>
            </div>
          );
        }
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
  const [showHistory, setShowHistory] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (confirm('Supprimer cette conversation ?')) {
      await deleteChat(user.uid, chatId);
      if (activeChatId === chatId) startNewChat();
    }
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

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        setImageFile({ file, base64: base64String });
      };
      reader.readAsDataURL(file);
    }
  };

  const sendMessage = async (text) => {
    if ((!text.trim() && !imageFile) || loading) return;
    
    setLoading(true);
    const userMsg = { role: 'user', content: text.trim() || 'Analyse cette image.' };
    
    // 🟢 GESTION DE L'IMAGE
    if (imageFile) {
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      const currentImage = imageFile;
      setImageFile(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/ai/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: newMessages, imageBase64: currentImage.base64 }),
        });
        const data = await res.json();
        
        const botMsg = { role: 'assistant', content: data.reply || "Je n'ai pas pu analyser l'image." };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);

        if (activeChatId) {
          await updateChatMessages(user.uid, activeChatId, updatedMessages);
        } else {
          const newChatRef = await createChat(user.uid, text || 'Image');
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
      } catch (err) {
        setMessages([...newMessages, { role: 'assistant', content: "Désolée, j'ai eu une erreur lors de l'analyse de l'image." }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 🟢 GESTION DU TEXTE ET DE L'AUDIO
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      
      // Si c'est un audio
      if (data.isAudio && data.audio) {
        const botMsg = { 
          role: 'assistant', 
          content: data.textReply, // On garde le texte pour l'historique
          audioData: data.audio, 
          wasAudio: true 
        };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);

        if (activeChatId) {
          await updateChatMessages(user.uid, activeChatId, updatedMessages);
        } else {
          const newChatRef = await createChat(user.uid, text);
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
        return;
      }

      // Si c'est du texte normal
      let finalReply = data.reply;
      
      try {
        const parsed = JSON.parse(data.reply);
        if (parsed.tool_call) {
          const toolResult = await executeToolCall(parsed.tool_call);
          finalReply = toolResult;
        }
      } catch (e) {}

      const botMsg = { role: 'assistant', content: finalReply };
      const updatedMessages = [...newMessages, botMsg];
      setMessages(updatedMessages);

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
      setLoading(false); // 🟢 TOUJOURS enlever le loader
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white md:h-[80vh] md:rounded-2xl shadow-2xl overflow-hidden">
        
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

        {/* 🟢 HISTORIQUE AMÉLIORÉ */}
        {showHistory && (
          <div className="absolute inset-0 z-10 bg-white p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">Historique des conversations</h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-full"><X size={16} /></button>
            </div>
            {chats.length === 0 ? (
              <p className="text-sm text-slate-500 text-center mt-10">Aucune conversation sauvegardée.</p>
            ) : (
              chats.map(c => (
                <div key={c.id} className="group flex items-center gap-2 mb-2">
                  <button 
                    onClick={() => loadChat(c)} 
                    className={`flex-1 text-left p-3 rounded-xl border text-sm truncate transition-colors ${activeChatId === c.id ? 'bg-brand-50 border-brand-200 text-brand-800' : 'hover:bg-slate-50 border-slate-200'}`}
                  >
                    {c.title || 'Conversation sans titre'}
                  </button>
                  <button onClick={(e) => handleDeleteChat(e, c.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

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
              {m.role === 'assistant' && m.wasAudio && m.audioData ? (
                <div className="w-[260px] rounded-2xl bg-brand-50 p-3 border border-brand-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Volume2 size={16} className="text-brand-600" />
                    <span className="text-xs font-semibold text-brand-700">Message vocal</span>
                  </div>
                  <audio controls src={`data:audio/wav;base64,${m.audioData}`} className="h-8 w-full" />
                </div>
              ) : m.role === 'assistant' && m.wasAudio && !m.audioData ? (
                <div className="w-[260px] rounded-2xl bg-slate-100 p-3 border border-slate-200 text-center">
                  <p className="text-xs text-slate-500 italic">Message vocal (audio expiré)</p>
                  <p className="text-[10px] text-slate-400 mt-1">Redemande pour l'écouter à nouveau.</p>
                </div>
              ) : (
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] ${
                  m.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                  {m.role === 'user' ? m.content : <MessageContent text={m.content} />}
                </div>
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

        <div className="border-t border-slate-100 p-3 bg-white">
          {imageFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2 w-fit">
              <ImageIcon size={14} className="text-brand-600" />
              <span className="text-xs text-slate-600 truncate max-w-[150px]">{imageFile.file.name}</span>
              <button onClick={() => setImageFile(null)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              onChange={handleImageSelect} 
              className="hidden" 
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()} 
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
              title="Envoyer une image"
            >
              <ImageIcon size={18} />
            </button>
            <input 
              type="text" value={input} onChange={(e) => setInput(e.target.value)} 
              placeholder="Pose ta question ou envoie une image..." 
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white" 
              disabled={loading} 
            />
            <button type="submit" disabled={(!input.trim() && !imageFile) || loading} className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50">
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
    }
