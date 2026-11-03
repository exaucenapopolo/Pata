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
  return addDoc(col(uid), {
    title: firstMessage.slice(0, 35) + (firstMessage.length > 35 ? '...' : ''),
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
  // 🟢 NETTOYAGE : On retire les éléments lourds (base64) pour ne pas dépasser 1 Mo
  const safeMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
    wasAudio: m.wasAudio || false,
    generatedImage: m.generatedImage || null, // L'URL est légère
    // imagePreview et audioData sont ignorés
  }));

  await updateDoc(doc(db, 'users', uid, 'ai_chats', chatId), {
    messages: safeMessages,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteChat(uid, chatId) {
  await deleteDoc(doc(db, 'users', uid, 'ai_chats', chatId));
      }
