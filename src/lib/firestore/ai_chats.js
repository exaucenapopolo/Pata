// src/lib/firestore/ai_chats.js
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
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
    title: firstMessage.slice(0, 30) + '...',
    messages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateChatMessages(uid, chatId, messages) {
  await updateDoc(doc(db, 'users', uid, 'ai_chats', chatId), {
    messages,
    updatedAt: serverTimestamp(),
  });
    }
