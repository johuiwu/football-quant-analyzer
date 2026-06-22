import { useState, useEffect } from 'react';
import { getTranslatedTeamName } from '../services/teamTranslatorService';

export function useTeamTranslation(name: string): { translated: string; loading: boolean } {
  const [translated, setTranslated] = useState(name);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!name) {
      setTranslated(name);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setTranslated(name); // 先显示英文原名

    getTranslatedTeamName(name)
      .then((result) => {
        if (!cancelled) {
          setTranslated(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTranslated(name); // 兜底返回英文原名
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [name]);

  return { translated, loading };
}
