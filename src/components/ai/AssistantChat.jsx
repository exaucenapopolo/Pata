/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, X, BrainCircuit, Loader2, Plus, MessageSquare, 
  Image as ImageIcon, Volume2, Trash2, Menu, Edit2, Check, Download
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeChats, createChat, updateChatMessages, deleteChat, updateChatTitle } from '@/lib/firestore/ai_chats';
import { createExpense } from '@/lib/firestore/expenses';
import { createIncome } from '@/lib/firestore/incomes';
import { createGoal } from '@/lib/firestore/goals';
import { createAutomation } from '@/lib/firestore/automations';

const SUGGESTIONS = [
  "Quel est mon bilan financier ?",
  "Comment mieux épargner ?",
  "Où est-ce que je dépense le plus ?",
  "Ajoute une dépense de 2000 FCFA pour le transport",
  "Crée un objectif d'épargne de 50 000 FCFA pour Noël",
  "Programme 500 FCFA de transport chaque jour",
  "Fais-moi mon bilan en audio",
  "Génère une image d'un cochon tirelire"
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
  const [imageFile, setImageFile] = useState(null);
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [imageModal, setImageModal] = useState(null);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [titleInput, setTitleInput] = useState('');

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
    setInput('');
    setImageFile(null);
    setShowSidebar(false);
  };

  const loadChat = (chat) => {
    setActiveChatId(chat.id);
    setMessages(chat.messages || []);
    setShowSidebar(false);
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (confirm('Supprimer cette conversation ?')) {
      await deleteChat(user.uid, chatId);
      if (activeChatId === chatId) startNewChat();
    }
  };

  const handleSaveTitle = async (chatId) => {
    if (titleInput.trim()) {
      await updateChatTitle(user.uid, chatId, titleInput);
    }
    setEditingTitleId(null);
  };

  const executeToolCall = async (toolCall) => {
    try {
      const { name, arguments: argsStr } = toolCall;
      const args = JSON.parse(argsStr);
      
      if (name === 'add_expense') {
        // 🟢 VALIDATION STRICTE : Si l'IA a mis "all" alors que ce n'est pas demandé, on bloque
        const finalIncomeId = args.incomeSourceId || 'all';
        const finalIncomeName = args.incomeSourceName || 'Tous les revenus';

        await createExpense(user.uid, {
          amount: args.amount, 
          categoryId: args.category || 'other',
          note: args.note || '',
          date: new Date().toISOString().slice(0, 10),
          incomeSourceId: finalIncomeId,
          incomeSourceName: finalIncomeName,
        });
        return `C'est fait ! J'ai bien enregistré ta dépense de ${args.amount} FCFA.`;
      }
      
      if (name === 'add_income') {
        await createIncome(user.uid, {
          amount: args.amount,
          source: args.source,
          categoryId: args.categoryId,
          note: args.note || '',
          date: new Date().toISOString().slice(0, 10),
          month: new Date().toISOString().slice(0, 7),
        });
        return `J'ai bien ajouté ton revenu "${args.source}" de ${args.amount} FCFA.`;
      }

      if (name === 'create_goal') {
        await createGoal(user.uid, {
          name: args.name, targetAmount: args.targetAmount, categoryId: 'savings',
          startDate: new Date().toISOString().slice(0, 10), deadline: args.deadline,
          frequencyDays: 7, penaltyAmount: 700,
        });
        return `J'ai créé ton objectif "${args.name}" de ${args.targetAmount} FCFA pour le ${args.deadline}.`;
      }

      if (name === 'add_automation') {
        const nextRun = new Date();
        if (args.frequency === 'daily') nextRun.setDate(nextRun.getDate() + 1);
        if (args.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        if (args.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);
        
        await createAutomation(user.uid, {
          amount: args.amount, categoryId: args.category || 'other', note: args.note,
          frequency: args.frequency, nextRun: nextRun.toISOString(),
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
        const base64String = reader.result;
        setImageFile({ file, base64: base64String.split(',')[1], preview: base64String });
      };
      reader.readAsDataURL(file);
    }
  };

  const sendMessage = async (text) => {
    if ((!text.trim() && !imageFile) || loading) return;
    
    setLoading(true);
    const userMsg = { 
      role: 'user', 
      content: text.trim() || 'Analyse cette image.',
      imagePreview: imageFile?.preview
    };
    
    if (imageFile) {
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      const currentImage = imageFile;
      setImageFile(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/ai/vision', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: newMessages, imageBase64: currentImage.base64 }),
        });
        const data = await res.json();
        
        const botMsg = { role: 'assistant', content: data.reply || "Je n'ai pas pu analyser l'image." };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);

        if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
        else {
          const newChatRef = await createChat(user.uid, text || 'Image');
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
      } catch (err) {
        setMessages([...newMessages, { role: 'assistant', content: "Désolée, j'ai eu une erreur." }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      
      if (!data.success) {
        setMessages([...newMessages, { role: 'assistant', content: data.error || "Erreur." }]);
        return;
      }

      if (data.isImage && data.imageUrl) {
        const botMsg = { role: 'assistant', content: null, generatedImage: data.imageUrl };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);
        if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
        else {
          const newChatRef = await createChat(user.uid, text);
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
        return;
      }

      if (data.isAudio && data.audio) {
        const botMsg = { role: 'assistant', content: data.textReply, audioData: data.audio, wasAudio: true };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);
        if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
        else {
          const newChatRef = await createChat(user.uid, text);
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
        return;
      }

      let finalReply = data.reply;
      try {
        const parsed = JSON.parse(data.reply);
        if (parsed.tool_call) finalReply = await executeToolCall(parsed.tool_call);
      } catch (e) {}

      const botMsg = { role: 'assistant', content: finalReply };
      const updatedMessages = [...newMessages, botMsg];
      setMessages(updatedMessages);

      if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
      else {
        const newChatRef = await createChat(user.uid, text);
        setActiveChatId(newChatRef.id);
        await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
      }

    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: "Désolée, erreur technique." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center">
      <div className="relative flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:h-[80vh] md:rounded-2xl">
        
        <div className={`absolute inset-y-0 left-0 z-30 w-64 transform bg-slate-50 transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 border-r border-slate-200 flex flex-col`}>
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <span className="font-bold text-slate-800">Discussions</span>
            <button onClick={() => setShowSidebar(false)} className="md:hidden p-1 rounded hover:bg-slate-200"><X size={18} /></button>
          </div>
          
          <div className="p-3">
            <button onClick={startNewChat} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors">
              <Plus size={16} /> Nouvelle discussion
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {chats.map(c => (
              <div key={c.id} className={`group relative flex items-center rounded-lg transition-colors ${activeChatId === c.id ? 'bg-brand-100' : 'hover:bg-slate-200'}`}>
                {editingTitleId === c.id ? (
                  <div className="flex w-full items-center gap-1 p-2">
                    <input autoFocus value={titleInput} onChange={(e) => setTitleInput(e.target.value)} className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm outline-none" onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle(c.id)} />
                    <button onClick={() => handleSaveTitle(c.id)} className="text-brand-600"><Check size={14} /></button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => loadChat(c)} className="flex-1 truncate p-2 text-left text-sm text-slate-700">{c.title || 'Sans titre'}</button>
                    <div className="hidden group-hover:flex items-center pr-1">
                      <button onClick={() => { setEditingTitleId(c.id); setTitleInput(c.title); }} className="p-1 text-slate-400 hover:text-brand-600"><Edit2 size={12} /></button>
                      <button onClick={(e) => handleDeleteChat(e, c.id)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={12} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowSidebar(true)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-200">
                <Menu size={18} className="text-slate-500" />
              </button>
              <div>
                <p className="text-base font-bold text-slate-900">Mč</p>
                <p className="text-[11px] text-slate-500 font-medium">Assistante financière</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200">
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
               <div className="space-y-4 mt-4">
                 <div className="text-center">
                   <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
                     <BrainCircuit size={32} />
                   </div>
                   <p className="text-sm text-slate-600 px-4">
                     Bonjour {user?.displayName?.split(' ')[0] || 'toi'}. Comment puis-je t'aider aujourd'hui ?
                   </p>
                 </div>
                 <div className="space-y-2 mt-6">
                   {SUGGESTIONS.map((s, i) => (
                     <button key={i} onClick={() => sendMessage(s)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-[13px] text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition-colors">
                       {s}
                     </button>
                   ))}
                 </div>
               </div>
            )}
            
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                {m.role === 'user' && m.imagePreview && (
                  <div className="mb-1 max-w-[200px] overflow-hidden rounded-xl border border-slate-200">
                    <img src={m.imagePreview} alt="Upload" className="h-auto w-full object-cover" onClick={() => setImageModal(m.imagePreview)} />
                  </div>
                )}
                
                {m.role === 'assistant' && m.generatedImage && (
                  <div className="w-[260px] rounded-2xl bg-brand-50 p-2 border border-brand-100 group">
                    <img src={m.generatedImage} alt="Générée" className="w-full h-auto rounded-lg cursor-pointer" onClick={() => setImageModal(m.generatedImage)} />
                    <div className="flex items-center justify-between mt-1 px-1">
                      <p className="text-[10px] text-slate-500 italic">Image générée</p>
                      <a href={m.generatedImage} download="pata-image.jpg" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-800 p-1" title="Télécharger l'image">
                        <Download size={14} />
                      </a>
                    </div>
                  </div>
                )}

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
                    <p className="text-xs text-slate-500 italic">Message vocal (expiré)</p>
                  </div>
                ) : m.role === 'assistant' && !m.generatedImage && !m.wasAudio ? (
                  <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] bg-slate-100 text-slate-800 rounded-bl-sm`}>
                    <MessageContent text={m.content} />
                  </div>
                ) : m.role === 'user' && !m.imagePreview ? (
                  <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] bg-brand-600 text-white rounded-br-sm`}>
                    {m.content}
                  </div>
                ) : null}
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
              <div className="mb-2 relative w-fit">
                <img src={imageFile.preview} alt="Aperçu" className="h-20 w-auto rounded-lg border border-slate-200 shadow-sm" />
                <button onClick={() => setImageFile(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"><X size={12} /></button>
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200">
                <ImageIcon size={18} />
              </button>
              <input 
                type="text" value={input} onChange={(e) => setInput(e.target.value)} 
                placeholder="Pose ta question..." 
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white" 
                disabled={loading} 
              />
              <button type="submit" disabled={(!input.trim() && !imageFile) || loading} className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {imageModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setImageModal(null)}>
            <div className="relative max-h-full max-w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <img src={imageModal} alt="Agrandissement" className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl" />
              <div className="mt-4 flex gap-3">
                <a href={imageModal} download="pata-image.jpg" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                  <Download size={16} /> Télécharger
                </a>
                <button onClick={() => setImageModal(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600">
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}