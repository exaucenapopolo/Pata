/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, X, BrainCircuit, Loader2, Plus, MessageSquare, 
  Image as ImageIcon, Volume2, Trash2, Menu, Edit2, Check, Download,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeChats, createChat, updateChatMessages, deleteChat, updateChatTitle } from '@/lib/firestore/ai_chats';

const SUGGESTIONS = [
  "Quel est mon bilan financier ?",
  "Comment mieux épargner ?",
  "Où est-ce que je dépense le plus ?",
  "Ajoute une dépense de 2000 FCFA pour le transport",
  "Crée un objectif d'épargne de 50 000 FCFA pour Noël",
  "Programme 500 FCFA de transport chaque jour",
  "J'ai 100 000 FCFA de revenus, aide-moi à faire un budget",
];

const MENTIONS = [
  { id: 'audio', label: 'Audio', icon: Volume2, color: 'text-blue-500', description: 'Répondre en vocal' },
  { id: 'image', label: 'Image', icon: Sparkles, color: 'text-brand-500', description: 'Générer une image' },
  { id: 'vision', label: 'Vision', icon: ImageIcon, color: 'text-purple-500', description: 'Analyser une image' },
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
  
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

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

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (val.endsWith('@')) {
      setShowMentions(true);
    } else if (showMentions && !val.includes('@')) {
      setShowMentions(false);
    }
  };

  const selectMention = (mentionId) => {
    const cleanInput = input.endsWith('@') ? input.slice(0, -1) : input;
    const mentionText = `@${mentionId.charAt(0).toUpperCase() + mentionId.slice(1)} `;
    setInput(cleanInput + mentionText);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const applySuggestion = (text) => {
    setInput(text);
    textareaRef.current?.focus();
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

  const sendMessage = async (rawText) => {
    if ((!rawText.trim() && !imageFile) || loading) return;
    
    const hasAudio = /@audio/i.test(rawText);
    const hasImageGen = /@image/i.test(rawText);
    const hasVision = /@vision/i.test(rawText);

    let text = rawText.replace(/@audio/gi, '').replace(/@image/gi, '').replace(/@vision/gi, '').trim();

    if (hasVision && !text) text = 'Analyse cette image.';
    if (hasImageGen && !text) return alert("Décris l'image que tu veux générer.");

    setLoading(true);
    const clientRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const userMsg = { 
      role: 'user', 
      content: rawText.trim() || 'Image',
      imagePreview: imageFile?.preview
    };
    
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    
    try {
      const token = await user.getIdToken();

      if (hasImageGen) {
        setImageFile(null);
        const res = await fetch('/api/ai/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt: text }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        const botMsg = { role: 'assistant', content: null, generatedImage: data.imageUrl };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);
        if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
        else {
          const newChatRef = await createChat(user.uid, rawText);
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
        return;
      }

      if (hasVision) {
        if (!imageFile) throw new Error("Veuillez joindre une image pour utiliser @Vision.");
        
        const currentImage = imageFile;
        setImageFile(null);
        const cleanMessagesForVision = [...messages, { role: 'user', content: text }];
        
        const res = await fetch('/api/ai/vision', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: cleanMessagesForVision, imageBase64: currentImage.base64 }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Je n'ai pas pu analyser l'image.");
        
        const botMsg = { role: 'assistant', content: data.reply || "Je n'ai pas pu analyser l'image." };
        const updatedMessages = [...newMessages, botMsg];
        setMessages(updatedMessages);
        if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
        else {
          const newChatRef = await createChat(user.uid, rawText);
          setActiveChatId(newChatRef.id);
          await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
        }
        return;
      }

      setImageFile(null);
      const cleanMessages = [
        ...messages.map((message) => ({ role: message.role, content: String(message.content || '') })),
        { role: 'user', content: text },
      ];
      const mode = hasAudio ? 'audio' : 'text';

      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: cleanMessages, mode, clientRequestId }),
      });
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error);

      // Les outils financiers sont désormais exécutés et vérifiés côté serveur.
      // Le client n'interprète plus de JSON d'appel d'outil et ne réexécute jamais une action.
      const finalReply = data.reply || data.textReply || "J'ai bien noté.";

      const botMsg = { 
        role: 'assistant', 
        content: finalReply,
        audioData: data.isAudio ? data.audio : null, 
        wasAudio: data.isAudio || false 
      };
      const updatedMessages = [...newMessages, botMsg];
      setMessages(updatedMessages);

      if (activeChatId) await updateChatMessages(user.uid, activeChatId, updatedMessages);
      else {
        const newChatRef = await createChat(user.uid, rawText);
        setActiveChatId(newChatRef.id);
        await updateChatMessages(user.uid, newChatRef.id, updatedMessages);
      }

    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: err.message || "Désolée, une erreur est survenue." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-0 md:p-6"
      onClick={onClose}
    >
      <div 
        className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl md:h-[85vh] md:max-w-5xl md:flex-row md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className={`absolute inset-y-0 left-0 z-30 w-72 shrink-0 transform bg-slate-50 transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full'} md:relative md:flex md:translate-x-0 border-r border-slate-200 flex flex-col`}>
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <span className="font-bold text-slate-800">Discussions</span>
            <button onClick={() => setShowSidebar(false)} className="md:hidden p-1 rounded hover:bg-slate-200"><X size={18} /></button>
          </div>
          
          <div className="p-3 shrink-0">
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

        <div className="flex h-full flex-1 flex-col overflow-hidden bg-white">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4 bg-slate-50/50">
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
               <div className="space-y-4 mt-4 max-w-2xl mx-auto">
                 <div className="text-center">
                   <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
                     <BrainCircuit size={32} />
                   </div>
                   <p className="text-sm text-slate-600 px-4">
                     Bonjour {user?.displayName?.split(' ')[0] || 'toi'}. Tape <strong>@</strong> dans le champ pour choisir une action spéciale (Audio, Image).
                   </p>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-6">
                   {SUGGESTIONS.map((s, i) => (
                     <button key={i} onClick={() => applySuggestion(s)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-[13px] text-slate-700 hover:border-brand-300 hover:bg-brand-50 transition-colors">
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
                    <img src={m.imagePreview} alt="Upload" className="h-auto w-full object-cover cursor-pointer" onClick={() => setImageModal(m.imagePreview)} />
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

          <div className="shrink-0 border-t border-slate-100 p-4 bg-white relative">
            {showMentions && (
              <div className="absolute bottom-full left-4 mb-2 w-72 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden z-20">
                <div className="p-2 space-y-1">
                  {MENTIONS.map(m => (
                    <button key={m.id} onClick={() => selectMention(m.id)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50 transition-colors">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 ${m.color}`}>
                        <m.icon size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">@{m.label}</p>
                        <p className="text-[10px] text-slate-500">{m.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {imageFile && (
              <div className="mb-2 relative w-fit">
                <img src={imageFile.preview} alt="Aperçu" className="h-20 w-auto rounded-lg border border-slate-200 shadow-sm" />
                <button onClick={() => setImageFile(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"><X size={12} /></button>
              </div>
            )}
            
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 max-w-3xl mx-auto items-end">
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200">
                <ImageIcon size={18} />
              </button>
              
              <textarea 
                ref={textareaRef}
                value={input} 
                onChange={handleInputChange} 
                placeholder="Pose ta question (tape @ pour les options)..." 
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-brand-500 focus:bg-white min-h-[44px] max-h-[150px]" 
                disabled={loading}
                rows={1}
              />
              
              <button type="submit" disabled={(!input.trim() && !imageFile) || loading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {imageModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setImageModal(null)}>
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