import {
  collection, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { subscribeSharedSnapshot } from './sharedSubscription';

export function subscribeDeposits(uid, cb) {
  const q = query(
    collection(db, 'deposits'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return subscribeSharedSnapshot(`deposits:${uid}`, q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('Deposits listener error:', err);
      cb([]);
    }
  );
    }
