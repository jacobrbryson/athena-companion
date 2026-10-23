import { useEffect, useState } from 'react';
import { financeApi, type Brokerage } from '../api/finance';

export function useBrokerage() {
  const [state, setState] = useState<{ data: Brokerage | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    financeApi.brokerage(fresh > 0).then(data => { if (alive) setState({ data, loading: false, error: null }); })
      .catch(e => { if (alive) setState(s => ({ data: s.data, loading: false, error: (e as Error).message || 'Unavailable' })); });
    return () => { alive = false; };
  }, [fresh]);
  return { ...state, refresh: () => setFresh(n => n + 1) };
}
