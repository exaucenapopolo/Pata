import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';

const projectsCollection = (uid) => collection(db, 'users', uid, 'projects');

export function subscribeProjects(uid, callback) {
  const projectsQuery = query(projectsCollection(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(projectsQuery, (snapshot) => {
    callback(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
  }, (error) => {
    console.error('Projects listener error:', error);
    callback([]);
  });
}

async function postProjectAction(path, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/projects/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de gérer ce projet.');
  return result;
}

export async function createProject(uid, data) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  return postProjectAction('create', data);
}

export async function deleteProject(uid, projectId, mode = 'detach') {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  if (!['detach', 'delete'].includes(mode)) throw new Error('Choix de suppression invalide.');
  return postProjectAction('delete', { projectId, mode });
}

export async function updateProject(uid, projectId, patch) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  return postProjectAction('update', { projectId, ...patch });
}
