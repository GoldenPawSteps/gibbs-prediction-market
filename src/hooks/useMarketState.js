import { useState, useCallback, useRef } from 'react';
import {
  computeCost,
  computePrices,
  computeTradeCost,
  computeKLDivergence,
  computeEntropy,
  computeLegendreValue,
} from '../math/marketMath';

const DEFAULT_OUTCOMES = ['Outcome A', 'Outcome B', 'Outcome C'];
const DEFAULT_PRIORS = [1 / 3, 1 / 3, 1 / 3];
const DEFAULT_QS = [0, 0, 0];
const DEFAULT_BETA = 1.0;

export function useMarketState() {
  const [beta, setBeta] = useState(DEFAULT_BETA);
  const [outcomes, setOutcomes] = useState(DEFAULT_OUTCOMES);
  const [priors, setPriors] = useState(DEFAULT_PRIORS);
  const [qs, setQs] = useState(DEFAULT_QS);
  const [priceHistory, setPriceHistory] = useState(() => {
    const prices = computePrices(DEFAULT_QS, DEFAULT_PRIORS, DEFAULT_BETA);
    return [{ step: 0, ...Object.fromEntries(prices.map((p, i) => [`p${i}`, p])) }];
  });
  const [costHistory, setCostHistory] = useState(() => {
    const cost = computeCost(DEFAULT_QS, DEFAULT_PRIORS, DEFAULT_BETA);
    return [{ step: 0, cost }];
  });
  const [tradeLog, setTradeLog] = useState([]);
  const [deltaQs, setDeltaQs] = useState(DEFAULT_QS.map(() => 0));
  const stepRef = useRef(0);

  const prices = computePrices(qs, priors, beta);
  const cost = computeCost(qs, priors, beta);
  const kl = computeKLDivergence(prices, priors);
  const entropy = computeEntropy(prices);
  const legendreVal = computeLegendreValue(qs, priors, beta);

  const executeTrade = useCallback(() => {
    const tradeCost = computeTradeCost(qs, deltaQs, priors, beta);
    const newQs = qs.map((q, i) => q + (deltaQs[i] || 0));
    setQs(newQs);

    const newPrices = computePrices(newQs, priors, beta);
    const newCost = computeCost(newQs, priors, beta);
    stepRef.current += 1;
    const step = stepRef.current;

    setPriceHistory(prev => [
      ...prev,
      { step, ...Object.fromEntries(newPrices.map((p, i) => [`p${i}`, p])) },
    ]);
    setCostHistory(prev => [...prev, { step, cost: newCost }]);
    setTradeLog(prev => [
      {
        step,
        deltaQs: [...deltaQs],
        tradeCost,
        newPrices,
        newCost,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 9),
    ]);
    setDeltaQs(deltaQs.map(() => 0));
  }, [qs, deltaQs, priors, beta]);

  const resetMarket = useCallback(() => {
    const n = outcomes.length;
    const uniformPrior = outcomes.map(() => 1 / n);
    const zeroQs = outcomes.map(() => 0);
    setPriors(uniformPrior);
    setQs(zeroQs);
    setDeltaQs(zeroQs);
    const resetPrices = computePrices(zeroQs, uniformPrior, beta);
    const resetCost = computeCost(zeroQs, uniformPrior, beta);
    setPriceHistory([{ step: 0, ...Object.fromEntries(resetPrices.map((p, i) => [`p${i}`, p])) }]);
    setCostHistory([{ step: 0, cost: resetCost }]);
    setTradeLog([]);
    stepRef.current = 0;
  }, [outcomes, beta]);

  const updatePrior = useCallback((idx, val) => {
    const newPriors = [...priors];
    newPriors[idx] = val;
    // Renormalize
    const sum = newPriors.reduce((a, b) => a + b, 0);
    const normalized = newPriors.map(p => p / sum);
    setPriors(normalized);
  }, [priors]);

  const addOutcome = useCallback(() => {
    const n = outcomes.length + 1;
    const newOutcomes = [...outcomes, `Outcome ${String.fromCharCode(64 + n)}`];
    const newPriors = newOutcomes.map(() => 1 / n);
    const newQs = [...qs, 0];
    const newDeltaQs = [...deltaQs, 0];
    setOutcomes(newOutcomes);
    setPriors(newPriors);
    setQs(newQs);
    setDeltaQs(newDeltaQs);
  }, [outcomes, qs, deltaQs]);

  const removeOutcome = useCallback((idx) => {
    if (outcomes.length <= 2) return;
    const newOutcomes = outcomes.filter((_, i) => i !== idx);
    const newQs = qs.filter((_, i) => i !== idx);
    const newDeltaQs = deltaQs.filter((_, i) => i !== idx);
    const newPriors = priors.filter((_, i) => i !== idx);
    const sum = newPriors.reduce((a, b) => a + b, 0);
    const normalized = newPriors.map(p => p / sum);
    setOutcomes(newOutcomes);
    setQs(newQs);
    setDeltaQs(newDeltaQs);
    setPriors(normalized);
  }, [outcomes, qs, deltaQs, priors]);

  const pendingTradeCost = computeTradeCost(qs, deltaQs, priors, beta);

  return {
    beta, setBeta,
    outcomes, setOutcomes,
    priors, setPriors,
    qs, setQs,
    prices,
    cost,
    kl,
    entropy,
    legendreVal,
    priceHistory,
    costHistory,
    tradeLog,
    deltaQs, setDeltaQs,
    pendingTradeCost,
    executeTrade,
    resetMarket,
    updatePrior,
    addOutcome,
    removeOutcome,
  };
}
