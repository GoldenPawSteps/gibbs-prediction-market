import { useState, useCallback, useEffect } from 'react';

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload;
}

export function usePublicMarkets(userId) {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMarkets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const payload = await api('/api/markets');
      setMarkets(payload.markets || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadMarkets(); }, [loadMarkets]);

  const createMarket = useCallback(async (form) => {
    const payload = await api('/api/markets', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setMarkets(prev => [payload.market, ...prev]);
    return payload;
  }, []);

  const tradeInMarket = useCallback(async (marketId, deltaQs) => {
    const payload = await api(`/api/markets/${marketId}/trade`, {
      method: 'POST',
      body: JSON.stringify({ deltaQs }),
    });
    setMarkets(prev => prev.map(m => m.id === marketId ? payload.market : m));
    return payload;
  }, []);

  const resolveMarket = useCallback(async (marketId, outcomeIdx) => {
    const payload = await api(`/api/markets/${marketId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ outcomeIdx }),
    });
    setMarkets(prev => prev.map(m => m.id === marketId ? payload.market : m));
    return payload;
  }, []);

  return { markets, loading, error, loadMarkets, createMarket, tradeInMarket, resolveMarket };
}
