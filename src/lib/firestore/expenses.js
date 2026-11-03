import { auth } from '@/lib/firebase/client';

// 🟢 La création passe par une API sécurisée pour vérifier les fonds
export async function createExpense(uid, data) {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté.');
  
  const token = await user.getIdToken();
  
  const res = await fetch('/api/expenses/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok || !result.success) {
    throw new Error(result.error || 'Erreur lors de l\'enregistrement de la dépense.');
  }
  
  return result;
}

// (On garde le reste tel quel pour la modification/suppression)
import { updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export async function updateExpense(uid, id, patch) {
  await updateDoc(doc(db, 'users', uid, 'expenses', id), patch);
}

export async function deleteExpense(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'expenses', id));
}
