'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeProjects } from '@/lib/firestore/projects';

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProjects([]); setLoading(false); return; }
    setLoading(true);
    return subscribeProjects(user.uid, (items) => {
      setProjects(items);
      setLoading(false);
    });
  }, [user]);

  return { projects, loading };
}
