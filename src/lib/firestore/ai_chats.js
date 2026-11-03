// src/lib/firestore/ai_chats.js
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'ai_chats');

export function subscribeChats(uid, cb) {
  const q = query(col(uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function createChat(uid, firstMessage) {
  const title = firstMessage ? firstMessage.slice(0, 35) + (firstMessage.length > 35 ? '...' : '') : 'Nouvelle discussion';
  return addDoc(col(uid), {
    title,
    messages: [],
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

  await updateDoc(doc(db, 'users', uid, 'ai_chats', chatId), {
    messages: safeMessages,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteChat(uid, chatId) {
  await deleteDoc(doc(db, 'users', uid, 'ai_chats', chatId));
    }
