import { auth } from '@/lib/firebase/client';

async function callForecastApi(path, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/forecasts/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Cette opération n’a pas pu être enregistrée.');
  return result;
}

export const saveVitalForecast = (payload) => callForecastApi('vital/save', payload);
export const deleteVitalForecast = () => callForecastApi('vital/delete');
export const saveDurationForecast = (payload) => callForecastApi('duration/save', payload);
export const deleteDurationForecast = (id) => callForecastApi('duration/delete', { id });
