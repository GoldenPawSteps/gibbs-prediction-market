import { useState } from 'react';
import { computePrices, computeTradeCost } from '../math/marketMath';
import { fmt } from '../math/formatNumber';
import { usePublicMarkets } from '../hooks/usePublicMarkets';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function MarketMakingPanel({ userId, balance, onBalanceChange }) {
  const { markets, loading, error, loadMarkets, createMarket, tradeInMarket, resolveMarket } =
    usePublicMarkets(userId);

  const [expanded, setExpanded] = useState(true);

  // --- Create form state ---
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [cOutcomes, setCOutcomes] = useState(['Yes', 'No']);
  const [cWeights, setCWeights] = useState([50, 50]);
  const [cBeta, setCBeta] = useState(1.0);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState('');

  // --- Trade panel state ---
  const [tradeId, setTradeId] = useState(null);
  const [tradeDeltas, setTradeDeltas] = useState([]);
  const [tradePending, setTradePending] = useState(false);
  const [tradeErr, setTradeErr] = useState('');

  // --- Resolve panel state ---
  const [resolveId, setResolveId] = useState(null);

  // Derived subsidy and normalized priors for the create form
  const cSubsidy = cBeta * Math.log(Math.max(2, cOutcomes.length));
  const cPriorsNorm = (() => {
    const s = cWeights.reduce((a, b) => a + b, 0);
    return cWeights.map(w => w / s);
  })();

  const handleCreate = async () => {
    if (!question.trim()) { setCreateError('Question is required.'); return; }
    if (cOutcomes.some(o => !o.trim())) { setCreateError('All outcome names must be non-empty.'); return; }
    setCreateError('');
    setCreatePending(true);
    try {
      const r = await createMarket({
        question: question.trim(),
        outcomes: cOutcomes,
        priors: cPriorsNorm,
        beta: cBeta,
      });
      onBalanceChange(r.balance);
      setQuestion('');
      setCOutcomes(['Yes', 'No']);
      setCWeights([50, 50]);
      setCBeta(1.0);
      setShowCreate(false);
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreatePending(false);
    }
  };

  const handleTrade = async () => {
    if (!tradeId) return;
    setTradePending(true);
    setTradeErr('');
    try {
      const r = await tradeInMarket(tradeId, tradeDeltas);
      onBalanceChange(r.balance);
      setTradeId(null);
    } catch (e) {
      setTradeErr(e.message);
    } finally {
      setTradePending(false);
    }
  };

  const handleResolve = async (outcomeIdx) => {
    try {
      const r = await resolveMarket(resolveId, outcomeIdx);
      onBalanceChange(r.balance);
      setResolveId(null);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="advanced-section">
      <div className="mm-section-header">
        <button
          className="toggle-section-btn mm-toggle-btn"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? '▼' : '▶'} Public Markets
          {markets.length > 0 && (
            <span className="mm-count-badge">{markets.length}</span>
          )}
        </button>
        <div className="mm-header-actions">
          <button
            className="btn-secondary btn-sm"
            onClick={loadMarkets}
            disabled={loading}
            title="Refresh markets"
          >
            {loading ? '↻' : '↻ Refresh'}
          </button>
          <button
            className={`btn-sm ${showCreate ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => { setShowCreate(s => !s); setCreateError(''); }}
          >
            {showCreate ? '✕ Cancel' : '+ Create Market'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mm-content">

          {/* ---- Create Market Form ---- */}
          {showCreate && (
            <div className="panel mm-create-panel">
              <h3 className="subsection-title">New Market</h3>

              <div className="mm-field">
                <label className="mm-label">Question</label>
                <input
                  className="mm-question-input"
                  type="text"
                  placeholder="e.g. Will X happen by end of 2026?"
                  value={question}
                  maxLength={200}
                  onChange={e => setQuestion(e.target.value)}
                />
              </div>

              <div className="mm-field">
                <div className="mm-label-row">
                  <label className="mm-label">Outcomes</label>
                  {cOutcomes.length < 10 && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const n = cOutcomes.length + 1;
                        setCOutcomes(p => [...p, `Outcome ${String.fromCharCode(64 + n)}`]);
                        setCWeights(p => [...p, 50]);
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
                <div className="mm-outcomes-editor">
                  {cOutcomes.map((name, i) => (
                    <div key={i} className="mm-outcome-row">
                      <span className="mm-swatch" style={{ background: COLORS[i % COLORS.length] }} />
                      <input
                        className="mm-outcome-name-input"
                        value={name}
                        placeholder={`Outcome ${i + 1}`}
                        onChange={e => {
                          const next = [...cOutcomes];
                          next[i] = e.target.value;
                          setCOutcomes(next);
                        }}
                      />
                      <span className="mm-prior-pct">{(cPriorsNorm[i] * 100).toFixed(0)}%</span>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        value={cWeights[i]}
                        onChange={e => {
                          const next = [...cWeights];
                          next[i] = Number(e.target.value);
                          setCWeights(next);
                        }}
                        className="slider-sm"
                      />
                      {cOutcomes.length > 2 && (
                        <button
                          className="btn-danger-sm"
                          onClick={() => {
                            setCOutcomes(p => p.filter((_, j) => j !== i));
                            setCWeights(p => p.filter((_, j) => j !== i));
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mm-field">
                <label className="mm-label">
                  Liquidity β: <strong>{cBeta.toFixed(2)}</strong>
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={cBeta}
                  onChange={e => setCBeta(parseFloat(e.target.value))}
                  className="slider"
                />
              </div>

              <div className="mm-subsidy-preview">
                Liquidity subsidy (β·ln n):{' '}
                <strong className={balance !== null && balance < cSubsidy ? 'negative' : 'positive'}>
                  ${fmt(cSubsidy)}
                </strong>
                {balance !== null && balance < cSubsidy && (
                  <span className="mm-inline-err"> — Insufficient balance</span>
                )}
              </div>

              {createError && <div className="mm-err-msg">{createError}</div>}

              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={
                  createPending ||
                  !question.trim() ||
                  (balance !== null && balance < cSubsidy)
                }
              >
                {createPending ? 'Creating…' : 'Create Market'}
              </button>
            </div>
          )}

          {/* ---- Market List ---- */}
          {error && <div className="mm-err-msg panel">{error}</div>}
          {!loading && markets.length === 0 && !error && (
            <div className="panel mm-empty">
              No public markets yet. Create one above to get started.
            </div>
          )}

          <div className="mm-market-list">
            {markets.map(market => {
              const prices = computePrices(market.qs, market.priors, market.beta);
              const myPos = market.positions[userId]?.qs || null;
              const isCreator = market.creatorId === userId;
              const isOpen = market.status === 'open';
              const isTradingThis = tradeId === market.id;
              const isResolvingThis = resolveId === market.id;
              const pendingCost = isTradingThis
                ? computeTradeCost(market.qs, tradeDeltas, market.priors, market.beta)
                : 0;

              return (
                <div key={market.id} className={`panel market-card market-card--${market.status}`}>
                  {/* Header */}
                  <div className="market-card-header">
                    <p className="market-question">{market.question}</p>
                    <div className="market-meta">
                      <span className={`market-badge market-badge--${market.status}`}>
                        {market.status === 'open'
                          ? 'Open'
                          : `✓ ${market.outcomes[market.resolvedOutcomeIdx]}`}
                      </span>
                      <span className="market-meta-text">
                        β={market.beta.toFixed(1)} · by {market.creatorName}
                      </span>
                      {market.traderCount > 0 && (
                        <span className="market-meta-text">
                          {market.traderCount} trader{market.traderCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="market-prices-list">
                    {market.outcomes.map((out, i) => (
                      <div key={i} className="market-price-row">
                        <span
                          className="market-price-label"
                          style={{ color: COLORS[i % COLORS.length] }}
                        >
                          {out}
                        </span>
                        <div className="price-bar-wrap">
                          <div
                            className="price-bar"
                            style={{
                              width: `${(prices[i] * 100).toFixed(1)}%`,
                              background: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                        <span className="market-price-pct">
                          {(prices[i] * 100).toFixed(1)}%
                        </span>
                        {myPos !== null && (
                          <span className={`market-my-pos mono ${myPos[i] >= 0 ? 'positive' : 'negative'}`}>
                            {myPos[i] >= 0 ? '+' : ''}{myPos[i].toFixed(2)}
                          </span>
                        )}
                        {market.status === 'resolved' && i === market.resolvedOutcomeIdx && (
                          <span className="market-winner-tag">★</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  {isOpen && !isTradingThis && !isResolvingThis && (
                    <div className="market-actions">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setTradeId(market.id);
                          setTradeDeltas(market.outcomes.map(() => 0));
                          setTradeErr('');
                          setResolveId(null);
                        }}
                      >
                        Trade
                      </button>
                      {isCreator && (
                        <button
                          className="btn-warning btn-sm"
                          onClick={() => {
                            setResolveId(market.id);
                            setTradeId(null);
                          }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  )}

                  {/* Trade form */}
                  {isTradingThis && (
                    <div className="mm-trade-form">
                      <div className="trade-inputs">
                        {market.outcomes.map((out, i) => (
                          <div key={i} className="trade-row">
                            <span
                              className="trade-label"
                              style={{ color: COLORS[i % COLORS.length] }}
                            >
                              {out}
                            </span>
                            <input
                              type="range"
                              min={-5}
                              max={5}
                              step={0.1}
                              value={tradeDeltas[i]}
                              onChange={e => {
                                const n = [...tradeDeltas];
                                n[i] = parseFloat(e.target.value);
                                setTradeDeltas(n);
                              }}
                              className="slider-sm"
                            />
                            <input
                              type="number"
                              className="num-input-sm"
                              value={tradeDeltas[i]}
                              step={0.1}
                              onChange={e => {
                                const n = [...tradeDeltas];
                                n[i] = parseFloat(e.target.value) || 0;
                                setTradeDeltas(n);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="trade-footer">
                        <div className={`trade-cost ${pendingCost >= 0 ? 'positive' : 'negative'}`}>
                          Cost: {pendingCost >= 0 ? '+' : ''}{fmt(pendingCost)}
                        </div>
                        {tradeErr && <span className="trade-error">{tradeErr}</span>}
                        <div className="trade-actions">
                          <button
                            className="btn-primary btn-sm"
                            onClick={handleTrade}
                            disabled={
                              tradePending ||
                              tradeDeltas.every(d => d === 0) ||
                              (balance !== null && balance < pendingCost)
                            }
                          >
                            {tradePending ? '…' : 'Execute'}
                          </button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => setTradeId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resolve form */}
                  {isResolvingThis && (
                    <div className="mm-resolve-form">
                      <p className="mm-resolve-prompt">Select the winning outcome to resolve:</p>
                      <div className="mm-resolve-outcomes">
                        {market.outcomes.map((out, i) => (
                          <button
                            key={i}
                            className="btn-resolve-outcome"
                            onClick={() => handleResolve(i)}
                            style={{
                              borderColor: COLORS[i % COLORS.length],
                              color: COLORS[i % COLORS.length],
                            }}
                          >
                            {out}
                          </button>
                        ))}
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setResolveId(null)}
                        >
                          Cancel
                        </button>
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
