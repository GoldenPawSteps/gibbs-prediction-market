import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../math/formatNumber';
import { useGeneralMarkets } from '../hooks/useGeneralMarkets';
import MathFormula from './MathFormula';

function parseJsonArray(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  return parsed;
}

function normalizePositive(values, label) {
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error(`${label} must contain at least 2 values.`);
  }
  if (!values.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
    throw new Error(`${label} must contain positive finite numbers.`);
  }
  const total = values.reduce((a, b) => a + b, 0);
  return values.map(v => v / total);
}

function impliedMeasure(cumulativeQ, baseWeights, beta) {
  const xs = cumulativeQ.map((q, i) => Math.log(baseWeights[i]) + q / beta);
  const maxX = Math.max(...xs);
  const sumExp = xs.reduce((acc, x) => acc + Math.exp(x - maxX), 0);
  return xs.map(x => Math.exp(x - maxX) / sumExp);
}

export default function GeneralMeasurePanel({ userId, balance, onBalanceChange }) {
  const { markets, loading, error, loadMarkets, createMarket, tradeInMarket, resolveMarket } = useGeneralMarkets(userId);

  const [expanded, setExpanded] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [question, setQuestion] = useState('');
  const [sampleSpaceText, setSampleSpaceText] = useState('[0, 1]');
  const [baseWeightsText, setBaseWeightsText] = useState('[0.5, 0.5]');
  const [beta, setBeta] = useState(1);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState('');

  const [tradeId, setTradeId] = useState(null);
  const [tradeMode, setTradeMode] = useState('expr');
  const [tradeExpr, setTradeExpr] = useState('2*x + 1');
  const [tradeVectorText, setTradeVectorText] = useState('[0, 0]');
  const [tradePending, setTradePending] = useState(false);
  const [tradeError, setTradeError] = useState('');

  const [resolveId, setResolveId] = useState(null);
  const [resolveWeightsText, setResolveWeightsText] = useState('[0.5, 0.5]');
  const [resolvePending, setResolvePending] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  const cardRefs = useRef({});
  const createPanelRef = useRef(null);
  const [pendingScroll, setPendingScroll] = useState(null);

  useEffect(() => {
    if (!pendingScroll) return;
    const el = pendingScroll === '__create__'
      ? createPanelRef.current
      : cardRefs.current[pendingScroll];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setPendingScroll(null);
  }, [pendingScroll]);

  const focusMarket = useMemo(() => {
    if (resolveId) return markets.find(m => m.id === resolveId) || null;
    if (tradeId) return markets.find(m => m.id === tradeId) || null;
    return markets[0] || null;
  }, [markets, tradeId, resolveId]);

  const focusImplied = useMemo(() => {
    if (!focusMarket) return null;
    return impliedMeasure(
      focusMarket.cumulativeQ,
      focusMarket.baseMeasureWeights,
      focusMarket.beta
    );
  }, [focusMarket]);

  const focusEntropy = useMemo(() => {
    if (!focusImplied) return null;
    return -focusImplied.reduce((acc, p) => acc + (p > 0 ? p * Math.log(p) : 0), 0);
  }, [focusImplied]);

  const focusKLDivergence = useMemo(() => {
    if (!focusMarket || !focusImplied) return null;
    const base = focusMarket.baseMeasureWeights;
    return focusImplied.reduce((acc, p, i) => {
      const b = base[i];
      if (p <= 0 || b <= 0) return acc;
      return acc + p * Math.log(p / b);
    }, 0);
  }, [focusMarket, focusImplied]);

  const defaultTradeMarket = useMemo(() => {
    if (focusMarket && focusMarket.status === 'open') return focusMarket;
    return markets.find(m => m.status === 'open') || null;
  }, [focusMarket, markets]);

  const defaultResolveMarket = useMemo(() => {
    if (focusMarket && focusMarket.status === 'open' && focusMarket.creatorId === userId) {
      return focusMarket;
    }
    return markets.find(m => m.status === 'open' && m.creatorId === userId) || null;
  }, [focusMarket, markets, userId]);

  const samplePayloads = useMemo(() => {
    const atomCount = focusMarket?.sampleSpace?.length || 2;
    const uniformWeights = Array.from({ length: atomCount }, () => 1 / atomCount);
    const sampleSpacePayload = focusMarket
      ? focusMarket.sampleSpace
      : [0, 1];
    const qValuesPayload = focusMarket
      ? focusMarket.sampleSpace.map(() => 0)
      : [0, 0];
    const resolutionPayload = focusMarket
      ? focusMarket.baseMeasureWeights
      : uniformWeights;

    return {
      sampleSpace: JSON.stringify(sampleSpacePayload, null, 2),
      qValues: JSON.stringify(qValuesPayload, null, 2),
      resolutionWeights: JSON.stringify(resolutionPayload, null, 2),
    };
  }, [focusMarket]);

  const copyPayload = async (name, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice(`${name} copied.`);
    } catch {
      setCopyNotice(`Could not copy ${name}. Clipboard permission denied.`);
    }
  };

  const insertPayload = (name, text) => {
    setExpanded(true);

    if (name === 'sampleSpace') {
      setShowCreate(true);
      setTradeId(null);
      setResolveId(null);
      setCreateError('');
      setSampleSpaceText(text);
      setCopyNotice('sampleSpace inserted into create form.');
      setPendingScroll('__create__');
      return;
    }

    if (name === 'qValues') {
      if (!defaultTradeMarket) {
        setCopyNotice('No open market is available to insert qValues.');
        return;
      }
      setShowCreate(false);
      setResolveId(null);
      setTradeId(defaultTradeMarket.id);
      setTradeMode('vector');
      setTradeError('');
      setTradeVectorText(text);
      setCopyNotice('qValues inserted into trade form (vector mode).');
      setPendingScroll(defaultTradeMarket.id);
      return;
    }

    if (name === 'resolutionWeights') {
      if (!defaultResolveMarket) {
        setCopyNotice('No open creator-owned market is available to insert resolutionWeights.');
        return;
      }
      setShowCreate(false);
      setTradeId(null);
      setResolveId(defaultResolveMarket.id);
      setResolveError('');
      setResolveWeightsText(text);
      setCopyNotice('resolutionWeights inserted into resolve form.');
      setPendingScroll(defaultResolveMarket.id);
    }
  };

  const createPreview = useMemo(() => {
    try {
      const sampleSpace = parseJsonArray(sampleSpaceText, 'Sample space');
      const base = normalizePositive(parseJsonArray(baseWeightsText, 'Base measure weights'), 'Base measure weights');
      if (sampleSpace.length !== base.length) {
        throw new Error('Sample space and base measure weights must have the same length.');
      }
      const subsidy = beta * Math.log(1 / Math.min(...base));
      return { subsidy, error: '', atoms: sampleSpace.length };
    } catch (e) {
      return { subsidy: null, atoms: null, error: e.message };
    }
  }, [sampleSpaceText, baseWeightsText, beta]);

  const onCreate = async () => {
    setCreateError('');
    let sampleSpace;
    let baseMeasureWeights;
    try {
      sampleSpace = parseJsonArray(sampleSpaceText, 'Sample space');
      baseMeasureWeights = normalizePositive(parseJsonArray(baseWeightsText, 'Base measure weights'), 'Base measure weights');
      if (sampleSpace.length !== baseMeasureWeights.length) {
        throw new Error('Sample space and base measure weights must have the same length.');
      }
    } catch (e) {
      setCreateError(e.message);
      return;
    }

    if (!question.trim()) {
      setCreateError('Question is required.');
      return;
    }

    setCreatePending(true);
    try {
      const response = await createMarket({
        question: question.trim(),
        sampleSpace,
        baseMeasureWeights,
        beta,
      });
      onBalanceChange(response.balance);
      setQuestion('');
      setSampleSpaceText('[0, 1]');
      setBaseWeightsText('[0.5, 0.5]');
      setBeta(1);
      setShowCreate(false);
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreatePending(false);
    }
  };

  const onTrade = async () => {
    if (!tradeId) return;
    setTradeError('');
    const payload = {};
    try {
      if (tradeMode === 'expr') {
        if (!tradeExpr.trim()) throw new Error('Expression is required.');
        payload.qExpr = tradeExpr.trim();
      } else {
        const qValues = parseJsonArray(tradeVectorText, 'qValues');
        if (!qValues.every(v => typeof v === 'number' && Number.isFinite(v))) {
          throw new Error('qValues must contain finite numbers.');
        }
        payload.qValues = qValues;
      }
    } catch (e) {
      setTradeError(e.message);
      return;
    }

    setTradePending(true);
    try {
      const response = await tradeInMarket(tradeId, payload);
      onBalanceChange(response.balance);
      setTradeId(null);
    } catch (e) {
      setTradeError(e.message);
    } finally {
      setTradePending(false);
    }
  };

  const onResolve = async () => {
    if (!resolveId) return;
    setResolveError('');
    let resolutionWeights;
    try {
      resolutionWeights = normalizePositive(parseJsonArray(resolveWeightsText, 'Resolution weights'), 'Resolution weights');
    } catch (e) {
      setResolveError(e.message);
      return;
    }

    setResolvePending(true);
    try {
      const response = await resolveMarket(resolveId, resolutionWeights);
      onBalanceChange(response.balance);
      setResolveId(null);
    } catch (e) {
      setResolveError(e.message);
    } finally {
      setResolvePending(false);
    }
  };

  return (
    <div className="advanced-section">
      <div className="gm-section-header">
        <button className="toggle-section-btn gm-toggle-btn" onClick={() => setExpanded(x => !x)}>
          {expanded ? '▼' : '▶'} General Measure Markets
          {markets.length > 0 && <span className="gm-count-badge">{markets.length}</span>}
        </button>
        <div className="gm-header-actions">
          <button className="btn-secondary btn-sm" onClick={loadMarkets} disabled={loading}>
            {loading ? '↻' : '↻ Refresh'}
          </button>
          <button className={`btn-sm ${showCreate ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setShowCreate(v => !v)}>
            {showCreate ? '✕ Cancel' : '+ Create General Market'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="gm-content">
          <div className="panel gm-math-panel">
            <h3 className="subsection-title">Measure-Theoretic View</h3>
            <p className="panel-desc">
              Continuous theory and finite-support approximation used by this implementation.
            </p>

            <div className="gm-formula-block">
              <MathFormula
                formula={String.raw`C(q)=\beta\ln\!\int_{\Omega} e^{q(\omega)/\beta}\,dP(\omega)`}
                display
              />
            </div>
            <div className="gm-formula-block">
              <MathFormula
                formula={String.raw`\Pi(q,\mu)=\int_{\Omega} q(\omega)\,d\mu(\omega)`}
                display
              />
            </div>

            <div className="gm-math-grid mono small">
              <div>
                Finite support: <MathFormula formula={String.raw`\Omega\approx\{\omega_i\}_{i=1}^n`} />
              </div>
              <div>
                Base measure: <MathFormula formula={String.raw`P\approx\{P_i\}_{i=1}^n,\ \sum_i P_i=1`} />
              </div>
              <div>
                Cost approx: <MathFormula formula={String.raw`C(q)=\beta\ln\sum_i P_i e^{q_i/\beta}`} />
              </div>
              <div>
                Resolution approx: <MathFormula formula={String.raw`\Pi(q,\mu)=\sum_i q_i\mu_i`} />
              </div>
            </div>

            {focusMarket && (
              <div className="gm-focus-stats mono small">
                <div>
                  Focus market atoms: {focusMarket.sampleSpace.length} · β={focusMarket.beta.toFixed(2)}
                </div>
                <div>
                  Current C(Q): {fmt(focusMarket.currentCost)}
                </div>
                {focusEntropy !== null && (
                  <div>
                    H(μ_q): {fmt(focusEntropy)}
                  </div>
                )}
                {focusKLDivergence !== null && (
                  <div>
                    KL(μ_q || P): {fmt(focusKLDivergence)}
                  </div>
                )}
              </div>
            )}

            <div className="gm-copy-payloads">
              <div className="gm-copy-header">
                Quick payloads
              </div>
              <div className="gm-copy-actions">
                <div className="gm-copy-row">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => copyPayload('sampleSpace', samplePayloads.sampleSpace)}
                  >
                    Copy sampleSpace
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => insertPayload('sampleSpace', samplePayloads.sampleSpace)}
                  >
                    Insert sampleSpace
                  </button>
                </div>
                <div className="gm-copy-row">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => copyPayload('qValues', samplePayloads.qValues)}
                  >
                    Copy qValues
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => insertPayload('qValues', samplePayloads.qValues)}
                  >
                    Insert qValues
                  </button>
                </div>
                <div className="gm-copy-row">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => copyPayload('resolutionWeights', samplePayloads.resolutionWeights)}
                  >
                    Copy resolutionWeights
                  </button>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => insertPayload('resolutionWeights', samplePayloads.resolutionWeights)}
                  >
                    Insert resolutionWeights
                  </button>
                </div>
              </div>
              {copyNotice && <div className="gm-copy-notice mono small">{copyNotice}</div>}
            </div>
          </div>

          {showCreate && (
            <div ref={createPanelRef} className="panel gm-create-panel">
              <h3 className="subsection-title">New General Market</h3>
              <div className="gm-field">
                <label className="gm-label">Question</label>
                <input
                  className="mm-question-input"
                  value={question}
                  maxLength={200}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="e.g. Theoretical random variable X market"
                />
              </div>
              <div className="gm-grid2">
                <div className="gm-field">
                  <label className="gm-label">Sample Space (JSON array)</label>
                  <textarea className="gm-textarea" value={sampleSpaceText} onChange={e => setSampleSpaceText(e.target.value)} />
                </div>
                <div className="gm-field">
                  <label className="gm-label">Base Measure Weights (JSON array)</label>
                  <textarea className="gm-textarea" value={baseWeightsText} onChange={e => setBaseWeightsText(e.target.value)} />
                </div>
              </div>
              <div className="gm-field">
                <label className="gm-label">Liquidity β: {beta.toFixed(2)}</label>
                <input className="slider" type="range" min={0.1} max={10} step={0.1} value={beta} onChange={e => setBeta(parseFloat(e.target.value))} />
              </div>

              <div className="gm-preview">
                {createPreview.error ? (
                  <span className="negative">{createPreview.error}</span>
                ) : (
                  <>
                    Atoms: <strong>{createPreview.atoms}</strong> · Subsidy: <strong className={balance !== null && createPreview.subsidy > balance ? 'negative' : 'positive'}>${fmt(createPreview.subsidy)}</strong>
                  </>
                )}
              </div>

              {createError && <div className="mm-err-msg">{createError}</div>}
              <button
                className="btn-primary"
                onClick={onCreate}
                disabled={createPending || Boolean(createPreview.error) || (balance !== null && createPreview.subsidy !== null && createPreview.subsidy > balance)}
              >
                {createPending ? 'Creating…' : 'Create General Market'}
              </button>
            </div>
          )}

          {error && <div className="mm-err-msg panel">{error}</div>}
          {!loading && markets.length === 0 && !error && <div className="panel mm-empty">No general markets yet.</div>}

          <div className="gm-market-list">
            {markets.map(m => {
              const isOpen = m.status === 'open';
              const isTradeOpen = tradeId === m.id;
              const isResolveOpen = resolveId === m.id;
              const myQ = m.positions?.[userId]?.qValues || null;
              const implied = impliedMeasure(m.cumulativeQ, m.baseMeasureWeights, m.beta);

              return (
                <div key={m.id} ref={el => { cardRefs.current[m.id] = el; }} className={`panel gm-card ${m.status === 'resolved' ? 'gm-card--resolved' : ''}`}>
                  <div className="gm-card-head">
                    <p className="market-question">{m.question}</p>
                    <div className="market-meta">
                      <span className={`market-badge market-badge--${m.status}`}>{m.status}</span>
                      <span className="market-meta-text">β={m.beta.toFixed(2)} · atoms={m.sampleSpace.length} · by {m.creatorName}</span>
                    </div>
                  </div>

                  <div className="gm-distribution mono small">
                    μ_q: [{implied.slice(0, 8).map(v => v.toFixed(3)).join(', ')}{implied.length > 8 ? ', ...' : ''}]
                  </div>

                  {myQ && (
                    <div className="gm-distribution mono small">
                      My q: [{myQ.slice(0, 8).map(v => v.toFixed(2)).join(', ')}{myQ.length > 8 ? ', ...' : ''}]
                    </div>
                  )}

                  {isOpen && !isTradeOpen && !isResolveOpen && (
                    <div className="market-actions">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setTradeId(m.id);
                          setResolveId(null);
                          setTradeError('');
                          setTradeVectorText(JSON.stringify(m.sampleSpace.map(() => 0)));
                        }}
                      >
                        Trade q
                      </button>
                      {m.creatorId === userId && (
                        <button
                          className="btn-warning btn-sm"
                          onClick={() => {
                            setResolveId(m.id);
                            setTradeId(null);
                            setResolveError('');
                            setResolveWeightsText(JSON.stringify(m.baseMeasureWeights));
                          }}
                        >
                          Resolve μ
                        </button>
                      )}
                    </div>
                  )}

                  {isTradeOpen && (
                    <div className="gm-trade-form">
                      <div className="gm-mode-row">
                        <button className={`btn-sm ${tradeMode === 'expr' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTradeMode('expr')}>Expression</button>
                        <button className={`btn-sm ${tradeMode === 'vector' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTradeMode('vector')}>Vector</button>
                      </div>

                      {tradeMode === 'expr' ? (
                        <input className="mm-question-input" value={tradeExpr} onChange={e => setTradeExpr(e.target.value)} placeholder="e.g. 2*x + 1" />
                      ) : (
                        <textarea className="gm-textarea" value={tradeVectorText} onChange={e => setTradeVectorText(e.target.value)} />
                      )}

                      {tradeError && <div className="mm-inline-err">{tradeError}</div>}
                      <div className="trade-actions">
                        <button className="btn-primary btn-sm" onClick={onTrade} disabled={tradePending}>{tradePending ? 'Executing…' : 'Execute Trade'}</button>
                        <button className="btn-secondary btn-sm" onClick={() => setTradeId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {isResolveOpen && (
                    <div className="gm-resolve-form">
                      <p className="mm-resolve-prompt">Provide resolution measure weights μ as JSON array:</p>
                      <textarea className="gm-textarea" value={resolveWeightsText} onChange={e => setResolveWeightsText(e.target.value)} />
                      {resolveError && <div className="mm-inline-err">{resolveError}</div>}
                      <div className="trade-actions">
                        <button className="btn-warning btn-sm" onClick={onResolve} disabled={resolvePending}>{resolvePending ? 'Resolving…' : 'Resolve'}</button>
                        <button className="btn-secondary btn-sm" onClick={() => setResolveId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
