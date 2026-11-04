import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'weekly_reports');

export function subscribeLatestWeeklyReport(uid, callback) {
  const reportsQuery = query(col(uid), orderBy('weekStart', 'desc'), limit(1));
  return onSnapshot(reportsQuery, (snapshot) => {
    const latest = snapshot.docs[0];
    callback(latest ? { id: latest.id, ...latest.data() } : null);
  });
}
