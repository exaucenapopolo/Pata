'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBusinesses } from '@/lib/business/client';

export function useBusinesses() {
  const [businesses, setBusinesses] = useState([]);
  const [premiumActive, setPremiumActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getBusinesses();
      setBusinesses(result.businesses);
      setPremiumActive(result.premiumActive);
    } catch (loadError) {
      setError(loadError.message || 'Impossible de charger les entreprises.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { businesses, premiumActive, loading, error, refresh };
}
