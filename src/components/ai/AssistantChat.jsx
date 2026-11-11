/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, X, BrainCircuit, Loader2, Plus, MessageSquare, 
  Image as ImageIcon, Volume2, Trash2, Menu, Edit2, Check, Download,
  Sparkles, Copy, CheckCheck
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { getDateLocale } from '@/lib/i18n/dateLocale.mjs';
import { subscribeChats, createChat, updateChatMessages, deleteChat, updateChatTitle } from '@/lib/firestore/ai_chats';

const SUGGESTIONS = {
  fr: [
    "Quel est mon bilan financier ?",
    "Comment mieux épargner ?",
    "Où est-ce que je dépense le plus ?",
    "Ajoute une dépense de 2 000 FCFA pour le transport",
    "Crée un objectif d'épargne de 50 000 FCFA pour Noël",
    "Programme 500 FCFA de transport chaque jour",
    "J'ai 100 000 FCFA de revenus, aide-moi à faire un budget",
  ],
  en: [
    "What is my financial summary?",
    "How can I save more effectively?",
    "Which categories do I spend the most on?",
    "Add an expense of XAF 2,000 for transport",
    "Create a savings goal of XAF 50,000 for Christmas",
    "Schedule XAF 500 for transport every day",
    "I have XAF 100,000 in income. Help me create a budget.",
  ],
};

const MENTIONS = [
  { id: 'audio', label: 'Audio', icon: Volume2, color: 'text-blue-500', description: 'Répondre en vocal' },
  { id: 'image', label: 'Image', icon: Sparkles, color: 'text-brand-500', description: 'Generate an image' },
  { id: 'vision', label: 'Vision', icon: ImageIcon, color: 'text-purple-500', description: 'Analyze an image' },
];

function cleanAssistantText(value, language = 'fr') {
  const replacements = language === 'en'
    ? [
        [/\bapply_budget_plan\b/gi, 'prepare a budget'],
        [/\badd_expense\b/gi, 'record an expense'],
        [/\bupdate_expense\b/gi, 'edit an expense'],
        [/\bdelete_expense\b/gi, 'delete an expense'],
        [/\badd_income\b/gi, 'record income'],
        [/\bcreate_goal\b/gi, 'create a savings goal'],
        [/\badd_automation\b/gi, 'schedule a recurring transaction'],
        [/\bget_subscription_status\b/gi, 'check your subscription'],
        [/\bactivate_premium_from_balance\b/gi, 'activate Premium using your balance'],
        [/\bcreate_duration_forecast\b/gi, 'save a duration forecast'],
        [/\bpause_automation\b/gi, 'pause a scheduled transaction'],
        [/\bresume_automation\b/gi, 'resume a scheduled transaction'],
        [/\bupdate_goal\b/gi, 'edit a goal'],
        [/\bremember_user_context\b/gi, 'remember this preference'],
        [/\bincomeSourceId\b|\bcategoryId\b|\bpremiumUntil\b/gi, 'account information'],
        [/\bFirestore\b|\bJSON\b|\bAPI\b|\btool call\b/gi, 'Pata service'],
      ]
    : [
        [/\bapply_budget_plan\b/gi, 'préparer un budget'],
        [/\badd_expense\b/gi, 'enregistrer une dépense'],
        [/\bupdate_expense\b/gi, 'modifier une dépense'],
        [/\bdelete_expense\b/gi, 'supprimer une dépense'],
        [/\badd_income\b/gi, 'enregistrer un revenu'],
        [/\bcreate_goal\b/gi, 'créer un objectif'],
        [/\badd_automation\b/gi, 'programmer une opération récurrente'],
        [/\bget_subscription_status\b/gi, 'consulter ton abonnement'],
        [/\bactivate_premium_from_balance\b/gi, 'activer Premium avec ton solde'],
        [/\bcreate_duration_forecast\b/gi, 'enregistrer une prévision de durée'],
        [/\bpause_automation\b/gi, 'mettre en pause une opération programmée'],
        [/\bresume_automation\b/gi, 'reprendre une opération programmée'],
        [/\bupdate_goal\b/gi, 'modifier un objectif'],
        [/\bremember_user_context\b/gi, 'mémoriser cette préférence'],
        [/\bincomeSourceId\b|\bcategoryId\b|\bpremiumUntil\b/gi, 'information de ton compte'],
        [/\bFirestore\b|\bJSON\b|\bAPI\b|\btool call\b/gi, 'service de Pata'],
      ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ''));
}

function renderInline(value, keyPrefix = 'inline') {
  const parts = String(value || '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${index}`} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${keyPrefix}-${index}`} className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[0.92em] text-slate-700">{part.slice(1, -1)}</code>;
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function MessageContent({ text, language = 'fr' }) {
  if (!text) return null;
  const lines = cleanAssistantText(text, language).replace(/\r/g, '').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index];
    const trimmed = current.trim();
    if (!trimmed) { index += 1; continue; }

    const summaryMatch = trimmed.match(/^\*\*(?:En bref|In brief)(?:\s*[—–-])?\*\*\s*(.*)$/i);
    if (summaryMatch) {
      blocks.push(
        <div key={`summary-${blocks.length}`} className="my-2 rounded-xl border border-brand-100 bg-brand-50/70 px-3 py-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-800">
            <Sparkles size={12}/> En bref
          </div>
          <p className="text-[13px] font-medium leading-6 text-slate-800">{renderInline(summaryMatch[1], `summary-${blocks.length}`)}</p>
        </div>
      );
      index += 1;
      continue;
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(current);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={`table-${blocks.length}`} className="my-3 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="w-full max-w-full overflow-hidden">
            <table className="w-full table-fixed border-collapse text-left text-[11px] sm:text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>{headers.map((header, cellIndex) => <th key={cellIndex} className="break-words border-b border-slate-200 px-2 py-2 font-semibold sm:px-3 sm:py-2.5">{renderInline(header, `th-${cellIndex}`)}</th>)}</tr>
              </thead>
              <tbody>{rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 ? 'bg-slate-50/70' : 'bg-white'}>
                  {headers.map((_, cellIndex) => <td key={cellIndex} className="break-words border-b border-slate-100 px-2 py-2 align-top text-slate-700 sm:px-3 sm:py-2.5">{renderInline(row[cellIndex] || '—', `td-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      );
      continue;
    }

    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      const content = trimmed.replace(/^#{1,3}\s*/, '');
      const className = level === 1 ? 'mt-3 text-base font-bold text-slate-900' : level === 2 ? 'mt-3 text-sm font-bold text-slate-900' : 'mt-2 text-sm font-semibold text-slate-800';
      blocks.push(<p key={`heading-${blocks.length}`} className={className}>{renderInline(content)}</p>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(<ul key={`list-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5 text-slate-700">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `li-${itemIndex}`)}</li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push(<ol key={`olist-${blocks.length}`} className="my-2 list-decimal space-y-1 pl-5 text-slate-700">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `oli-${itemIndex}`)}</li>)}</ol>);
      continue;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push(<blockquote key={`quote-${blocks.length}`} className="my-2 border-l-2 border-brand-400 pl-3 text-slate-600">{renderInline(trimmed.slice(2))}</blockquote>);
      index += 1;
      continue;
    }

    blocks.push(<p key={`p-${blocks.length}`} className="leading-relaxed text-slate-700">{renderInline(trimmed, `p-${blocks.length}`)}</p>);
    index += 1;
  }

  return <div className="space-y-1.5 break-words">{blocks}</div>;
}

function toDoualaDateKey(value) {
  if (value == null) return null;
  const date = value?.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value || 0));
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getRelativeDateKey(dateKey, offset) {
  const date = new Date(dateKey + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatConversationTime(value, language = 'fr') {
  if (value == null) return '';
  const date = value?.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value || 0));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(getDateLocale(language), {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function groupChatsByDate(chats, language = 'fr') {
  const todayKey = toDoualaDateKey(new Date());
  const yesterdayKey = todayKey ? getRelativeDateKey(todayKey, -1) : null;
  const beforeYesterdayKey = todayKey ? getRelativeDateKey(todayKey, -2) : null;
  const groups = new Map();

  chats.forEach((chat) => {
    const key = toDoualaDateKey(chat.updatedAt || chat.createdAt) || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(chat);
  });

  return Array.from(groups, ([key, items]) => {
    let label = language === 'en' ? 'Unknown date' : 'Date inconnue';
    if (key === todayKey) label = language === 'en' ? 'Today' : "Aujourd’hui";
    else if (key === yesterdayKey) label = language === 'en' ? 'Yesterday' : 'Hier';
    else if (key === beforeYesterdayKey) label = language === 'en' ? 'Day before yesterday' : 'Avant-hier';
    else if (key !== 'unknown') {
      label = new Intl.DateTimeFormat(getDateLocale(language), {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(key + 'T12:00:00Z'));
    }
    return { key, label, chats: items };
  });
}

function getSuggestedPrompts(text = '', language = 'fr') {
  const value = String(text).toLocaleLowerCase(language === 'en' ? 'en' : 'fr');
  const suggestions = [];
  if (language === 'en') {
    if (/budget|expense|spend|category/.test(value)) suggestions.push('How can I reduce spending in this category?');
    if (/income|revenue|source|balance/.test(value)) suggestions.push('Show me which income sources still have money available.');
    if (/saving|savings|goal/.test(value)) suggestions.push('Help me improve my savings plan.');
    if (/forecast|duration|run out|last/.test(value)) suggestions.push('Analyze my forecasts in more detail.');
    if (/premium|subscription/.test(value)) suggestions.push('How much time is left on my subscription?');
    if (!suggestions.length) suggestions.push('Give me a recommendation based on my current financial situation.');
  } else {
    if (/budget|dépense|catégorie/.test(value)) suggestions.push('Aide-moi à réduire mes dépenses dans ce poste.');
    if (/revenu|source|solde/.test(value)) suggestions.push('Montre-moi les revenus qui disposent encore d’un solde.');
    if (/épargne|objectif/.test(value)) suggestions.push('Aide-moi à améliorer mon plan d’épargne.');
    if (/prévision|vital|durée/.test(value)) suggestions.push('Analyse mes prévisions plus en profondeur.');
    if (/premium|abonnement/.test(value)) suggestions.push('Vérifie la durée restante de mon abonnement.');
    if (!suggestions.length) suggestions.push('Fais-moi une recommandation adaptée à ma situation actuelle.');
  }
  return [...new Set(suggestions)].slice(0, 2);
}

export function AssistantChat({ open, onClose, initialPrompt = "" }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const messageLimit = input.includes('CONTENU DU DOCUMENT :') ? 5000 : 1800;
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [imageModal, setImageModal] = useState(null);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const groupedChats = useMemo(() => groupChatsByDate(chats, language), [chats, language]);
  
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const longPressTimer = useRef(null);

  useEffect(() => {
    if (!user) return;
    return subscribeChats(user.uid, setChats);
  }, [user]);

  useEffect(() => {
    if (open && initialPrompt) {
      setInput(String(initialPrompt).slice(0, 5000)); setInputError('');
      setActiveChatId(null);
      setMessages([]);
      setShowSidebar(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, initialPrompt]);

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
    setInputError('');
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
    if (confirm(language === 'en' ? 'Delete this conversation?' : 'Supprimer cette conversation ?')) {
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

  const copyMessage = async (content) => {
    if (!content || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(String(content));
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = String(content);
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  };

  const sendPromptSuggestion = (prompt) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    const limit = raw.includes('CONTENU DU DOCUMENT :') ? 5000 : 1800;
    const val = raw.slice(0, limit);
    setInput(val);
    setInputError(raw.length > limit ? (language === 'en' ? `The limit is ${limit.toLocaleString('en-GB')} characters. The text was shortened to prevent overflow.` : `La limite est de ${limit.toLocaleString('fr-FR')} caractères. Le texte a été raccourci pour éviter un dépassement.`) : '');
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
    const allowedLength = rawText.includes('CONTENU DU DOCUMENT :') ? 5000 : 1800;
    if (rawText.length > allowedLength) { setInput(rawText.slice(0, allowedLength)); setInputError(language === 'en' ? `The limit is ${allowedLength.toLocaleString('en-GB')} characters. Shorten your message before sending.` : `La limite est de ${allowedLength.toLocaleString('fr-FR')} caractères. Raccourcis ton message avant l’envoi.`); return; }
    setInputError('');
    
    const hasAudio = /@audio/i.test(rawText);
    const hasImageGen = /@image/i.test(rawText);
    const hasVision = /@vision/i.test(rawText);

    let text = rawText.replace(/@audio/gi, '').replace(/@image/gi, '').replace(/@vision/gi, '').trim();

    if (hasVision && !text) text = language === 'en' ? 'Analyze this image.' : 'Analyse cette image.';
    if (hasImageGen && !text) return alert(language === 'en' ? 'Describe the image you want to generate.' : "Décris l'image que tu veux générer.");

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
          body: JSON.stringify({ prompt: text, language }),
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
          body: JSON.stringify({ messages: cleanMessagesForVision, imageBase64: currentImage.base64, language }),
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
        ...messages.slice(-5).map((message) => ({ role: message.role, content: String(message.content || '').slice(-650) })),
        { role: 'user', content: text },
      ];
      const mode = hasAudio ? 'audio' : 'text';

      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: cleanMessages, mode, clientRequestId, language }),
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
        wasAudio: data.isAudio || false,
        quickActions: Array.isArray(data.quickActions) ? data.quickActions : [],
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
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-slate-950/35 px-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-3 sm:py-3 md:px-6 md:py-6"
      onClick={onClose}
    >
      <div 
        className="relative flex h-full max-h-full w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-3xl md:h-[90dvh] md:max-w-6xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        
        {showSidebar && <button type="button" aria-label="Fermer les discussions" onClick={() => setShowSidebar(false)} className="absolute inset-0 z-20 bg-slate-950/25 md:hidden" />}
        <div className={`absolute inset-y-0 left-0 z-30 w-[min(82vw,320px)] shrink-0 transform bg-slate-50 transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full'} md:relative md:flex md:w-72 md:translate-x-0 border-r border-slate-200 flex flex-col`}>
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <span className="font-bold text-slate-800">Discussions</span>
            <button onClick={() => setShowSidebar(false)} className="md:hidden p-1 rounded hover:bg-slate-200"><X size={18} /></button>
          </div>
          
          <div className="p-3 shrink-0">
            <button onClick={startNewChat} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors">
              <Plus size={16} /> Nouvelle discussion
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {groupedChats.length === 0 ? (
              <p className="px-2 py-4 text-xs leading-5 text-slate-500">Tes conversations enregistrées apparaîtront ici, classées par date.</p>
            ) : groupedChats.map((group) => (
              <section key={group.key} className="mb-4">
                <h3 className="sticky top-0 z-10 mb-1.5 bg-slate-50 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.label}</h3>
                <div className="space-y-1">
                  {group.chats.map((c) => (
                    <div key={c.id} className={`group relative flex items-center rounded-xl transition-colors ${activeChatId === c.id ? 'bg-brand-100' : 'hover:bg-slate-200'}`}>
                      {editingTitleId === c.id ? (
                        <div className="flex w-full items-center gap-1 p-2">
                          <input autoFocus value={titleInput} onChange={(e) => setTitleInput(e.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none" onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle(c.id)} />
                          <button type="button" onClick={() => handleSaveTitle(c.id)} className="rounded-lg p-2 text-brand-600 hover:bg-white" aria-label="Enregistrer le titre"><Check size={14} /></button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => loadChat(c)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                            <span className="block truncate text-xs font-medium text-slate-700">{c.title || 'Sans titre'}</span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">{formatConversationTime(c.updatedAt || c.createdAt, language)}</span>
                          </button>
                          <div className="flex shrink-0 items-center pr-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                            <button type="button" onClick={() => { setEditingTitleId(c.id); setTitleInput(c.title || ''); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-brand-600" aria-label="Renommer la conversation"><Edit2 size={12} /></button>
                            <button type="button" onClick={(e) => handleDeleteChat(e, c.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-red-600" aria-label="Supprimer la conversation"><Trash2 size={12} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex h-full flex-1 flex-col overflow-hidden bg-white">
          <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white/95 px-3 pt-1 sm:px-4">
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

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-5 sm:p-4 sm:pb-6 space-y-4">
            {messages.length === 0 && (
               <div className="space-y-4 mt-4 max-w-2xl mx-auto">
                 <div className="text-center">
                   <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
                     <BrainCircuit size={32} />
                   </div>
                   <p className="text-sm text-slate-600 px-4">
                     {language === 'en' ? 'Hello' : 'Bonjour'} {user?.displayName?.split(' ')[0] || (language === 'en' ? 'there' : 'toi')}. {language === 'en' ? 'Type' : 'Tape'} <strong>@</strong> {language === 'en' ? 'in the message box to choose a special action (Audio, Image).' : 'dans le champ pour choisir une action spéciale (Audio, Image).'}
                   </p>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-6">
                   {SUGGESTIONS[language === 'en' ? 'en' : 'fr'].map((s, i) => (
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
                    <button type="button" onClick={() => sendPromptSuggestion(language === 'en' ? '@image Create a new image on the same topic as the previous one, with a different composition.' : '@image Crée une nouvelle image sur le même sujet que la précédente, avec une composition différente.')} className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-brand-700 hover:bg-brand-50">Créer une autre image</button>
                  </div>
                )}

                {m.role === 'assistant' && m.wasAudio ? (
                  <div className="max-w-[96%] sm:max-w-[92%] min-w-0">
                    <div
                      className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-800 shadow-sm"
                      onContextMenu={(event) => { event.preventDefault(); copyMessage(m.content); }}
                      onTouchStart={() => { longPressTimer.current = setTimeout(() => copyMessage(m.content), 550); }}
                      onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                      onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Volume2 size={15} className="text-brand-600" />
                        <span className="text-xs font-semibold text-brand-700">Réponse vocale</span>
                      </div>
                      {m.audioData ? (
                        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-2.5"><audio controls preload="metadata" src={`data:audio/wav;base64,${m.audioData}`} className="h-10 w-full" /><p className="mt-1 text-[10px] text-slate-400">Lecture audio · Tu peux mettre en pause ou reprendre à tout moment.</p></div>
                      ) : (
                        <p className="mb-2 text-xs text-slate-500 italic">Le fichier vocal n’est plus disponible, mais le texte de la réponse reste accessible.</p>
                      )}
                      <MessageContent text={m.content} language={language} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
                      <button type="button" onClick={() => copyMessage(m.content)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        <Copy size={12} /> Copier la réponse
                      </button>
                      {Array.isArray(m.quickActions) && m.quickActions.map((action, actionIndex) => (
                        <a key={`${action.href}-${actionIndex}`} href={action.href} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:border-brand-300 hover:bg-brand-50">{action.label}</a>
                      ))}
                      {getSuggestedPrompts(m.content, language).map((prompt, promptIndex) => (
                        <button key={`${i}-${promptIndex}`} type="button" onClick={() => sendPromptSuggestion(prompt)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700">{prompt}</button>
                      ))}
                    </div>
                  </div>
                ) : m.role === 'assistant' && !m.generatedImage ? (
                  <div className="max-w-[96%] sm:max-w-[92%] min-w-0">
                    <div
                      className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-800 shadow-sm"
                      onContextMenu={(event) => { event.preventDefault(); copyMessage(m.content); }}
                      onTouchStart={() => { longPressTimer.current = setTimeout(() => copyMessage(m.content), 550); }}
                      onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                      onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                    >
                      <MessageContent text={m.content} language={language} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
                      <button type="button" onClick={() => copyMessage(m.content)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        <Copy size={12} /> Copier la réponse
                      </button>
                      {Array.isArray(m.quickActions) && m.quickActions.map((action, actionIndex) => (
                        <a key={`${action.href}-${actionIndex}`} href={action.href} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:border-brand-300 hover:bg-brand-50">{action.label}</a>
                      ))}
                      {getSuggestedPrompts(m.content, language).map((prompt, promptIndex) => (
                        <button key={`${i}-${promptIndex}`} type="button" onClick={() => sendPromptSuggestion(prompt)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700">{prompt}</button>
                      ))}
                    </div>
                  </div>
                ) : m.role === 'user' && !m.imagePreview ? (
                  <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] bg-brand-600 text-white rounded-br-sm`}>
                    {m.content}
                  </div>
                ) : null}
              </div>
            ))}
            {loading && (
              <div className="flex w-fit max-w-[88%] items-center gap-3 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm" role="status" aria-live="polite">
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand-200/60" />
                  <BrainCircuit size={16} className="relative text-brand-700" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800">Mč prépare sa réponse</span>
                  <span className="mt-1 flex items-center gap-1.5" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" />
                    <span className="ml-1 text-[10px] text-slate-500">Un instant…</span>
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="relative shrink-0 border-t border-slate-200 bg-white px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-4 sm:pt-4">
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
                maxLength={messageLimit}
                placeholder="Pose ta question (tape @ pour les options)..." 
                className="min-h-[48px] max-h-[160px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-base outline-none transition focus:border-brand-500 focus:bg-white sm:text-sm" 
                disabled={loading}
                rows={1}
              />
              
              <button type="submit" disabled={(!input.trim() && !imageFile) || loading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-50">
                <Send size={18} />
              </button>
            </form>
            <div className="mx-auto mt-1 flex max-w-3xl items-center justify-between gap-3 px-1 text-[10px]" aria-live="polite"><span className={inputError ? 'text-amber-700' : 'text-slate-400'}>{inputError || 'Garde ton message concis pour obtenir une réponse plus rapide.'}</span><span className="shrink-0 tabular-nums text-slate-500">{Math.max(0, messageLimit - input.length).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR')} {language === 'en' ? 'characters left' : 'caractères restants'}</span></div>
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