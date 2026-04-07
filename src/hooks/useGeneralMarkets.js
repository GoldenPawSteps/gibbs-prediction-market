import { useCallback, useEffect, useState } from 'react';

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

export function useGeneralMarkets(userId) {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMarkets = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const payload = await api('/api/general-markets');
      setMarkets(payload.markets || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadMarkets(); }, [loadMarkets]);

  const createMarket = useCallback(async (form) => {
    const payload = await api('/api/general-markets', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setMarkets(prev => [payload.market, ...prev]);
    return payload;
  }, []);

  const tradeInMarket = useCallback(async (marketId, payload) => {
    const response = await api(`/api/general-markets/${marketId}/trade`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setMarkets(prev => prev.map(m => (m.id === marketId ? response.market : m)));
    return response;
  }, []);

  const resolveMarket = useCallback(async (marketId, resolutionWeights) => {
    const payload = await api(`/api/general-markets/${marketId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolutionWeights }),
    });
    setMarkets(prev => prev.map(m => (m.id === marketId ? payload.market : m)));
    return payload;
  }, []);

  return {
    markets,
    loading,
    error,
    loadMarkets,
    createMarket,
    tradeInMarket,
    resolveMarket,
  };
}
