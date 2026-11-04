'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeLatestWeeklyReport } from '@/lib/firestore/weeklyReports';

export function useWeeklyReport() {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setReport(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return subscribeLatestWeeklyReport(user.uid, (latest) => {
      setReport(latest);
      setLoading(false);
    });
  }, [user]);

  return { report, loading };
}
