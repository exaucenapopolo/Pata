// src/lib/firestore/ai_chats.js
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'ai_chats');

async function authenticatedChatRequest(user, url) {
  if (!user) throw new Error('Utilisateur non connecté.');
  const token = await user.getIdToken();
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Impossible de charger cette discussion.');
  }
  return result;
}

// Cette liste ne retourne que les métadonnées. Le contenu des messages est
// récupéré séparément, après le clic sur une discussion.
export async function fetchChats(user) {
  const result = await authenticatedChatRequest(user, '/api/ai/chats');
  return Array.isArray(result.chats) ? result.chats : [];
}

export async function fetchChatMessages(user, chatId) {
  const safeId = String(chatId || '').trim();
  if (!safeId || safeId.includes('/')) throw new Error('Identifiant de discussion invalide.');
  const result = await authenticatedChatRequest(user, '/api/ai/chats?id=' + encodeURIComponent(safeId));
  return result.chat;
}

export async function createChat(uid, firstMessage) {
  const title = firstMessage ? firstMessage.slice(0, 35) + (firstMessage.length > 35 ? '...' : '') : 'Nouvelle discussion';
  return addDoc(col(uid), {
    title,
    messages: [],
    messageCount: 0,
    lastMessagePreview: '',
    source: 'assistant',
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateChatTitle(uid, chatId, newTitle) {
  await updateDoc(doc(db, 'users', uid, 'ai_chats', chatId), {
    title: newTitle.trim().slice(0, 50),
    updatedAt: serverTimestamp(),
  });
}

export async function updateChatPinned(uid, chatId, pinned) {
  await updateDoc(doc(db, 'users', uid, 'ai_chats', chatId), {
    pinned: pinned === true,
    updatedAt: serverTimestamp(),
  });
}

export async function updateChatMessages(uid, chatId, messages) {
  // 🟢 NETTOYAGE RADICAL : On reconstruit un objet propre avec SEULEMENT les clés autorisées.
  // On supprime toutes les clés qui pourraient être "undefined" et on ignore le base64.
  const safeMessages = messages.map(m => {
    const safe = {};
    
    // Role (toujours string)
    safe.role = (m.role === 'assistant' || m.role === 'user') ? m.role : 'user';
    
    // Content (toujours string ou null)
    safe.content = (typeof m.content === 'string' && m.content.trim() !== '') ? m.content : null;
    
    // WasAudio (toujours boolean)
    safe.wasAudio = (m.wasAudio === true);
    
    // GeneratedImage (toujours string ou null)
    safe.generatedImage = (typeof m.generatedImage === 'string' && m.generatedImage !== '') ? m.generatedImage : null;

    return safe;
  });

  const lastMessage = safeMessages[safeMessages.length - 1];
  const lastMessagePreview = String(lastMessage?.content || (lastMessage?.generatedImage ? 'Image générée' : ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  await updateDoc(doc(db, 'users', uid, 'ai_chats', chatId), {
    messages: safeMessages,
    messageCount: safeMessages.length,
    lastMessagePreview,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteChat(uid, chatId) {
  await deleteDoc(doc(db, 'users', uid, 'ai_chats', chatId));
    }
