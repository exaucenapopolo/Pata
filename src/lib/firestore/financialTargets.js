import { auth } from '@/lib/firebase/client';

export async function checkFinancialOperation(data) {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/financial-targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action: 'check-operation', ...data }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de vérifier tes engagements financiers.');
  return result;
}
