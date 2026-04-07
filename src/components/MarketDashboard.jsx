import MathFormula from './MathFormula';
import { PriceEvolutionChart, CostEvolutionChart, TiltingVisualizationChart } from './Charts';
import EducationPanel from './EducationPanel';
import ContinuousMode from './ContinuousMode';
import { fmt } from '../math/formatNumber';
import MarketMakingPanel from './MarketMakingPanel';
import GeneralMeasurePanel from './GeneralMeasurePanel';

const OUTCOME_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function MarketDashboard({
  market,
  darkMode,
  showAdvanced,
  setShowAdvanced,
  showContinuous,
  setShowContinuous,
  showEducation,
  setShowEducation,
  syncStatus,
  balance,
  onExecuteTrade,
  tradeError,
  userId,
  onBalanceChange,
}) {
  return (
    <>
      <div className="formula-banner">
        <MathFormula
          formula={String.raw`C(q) = \beta \ln \sum_{i=1}^n P_i \, e^{q_i/\beta}`}
          display
        />
      </div>

      <div className="panel market-sync-panel">
        {syncStatus === 'loading' && 'Loading your saved market state...'}
        {syncStatus === 'saving' && 'Saving your market state...'}
        {syncStatus === 'saved' && 'All market changes saved.'}
        {syncStatus === 'error' && 'Could not sync market state right now.'}
      </div>

      <div className="panel beta-panel">
        <div className="beta-row">
          <div className="beta-info">
            <label className="beta-label">
              Liquidity Parameter <MathFormula formula={String.raw`\beta`} />
              <span className="beta-val">{market.beta.toFixed(2)}</span>
            </label>
            <p className="beta-desc">
              Higher beta means more liquid (prices less sensitive). Lower beta means less liquid (prices very sensitive).
            </p>
          </div>
          <input
            type="range"
            min={0.05}
            max={10}
            step={0.05}
            value={market.beta}
            onChange={e => market.setBeta(parseFloat(e.target.value))}
            className="slider beta-slider"
          />
        </div>
      </div>

      <div className="main-grid">
        <div className="panel outcomes-panel">
          <div className="panel-header">
            <h2 className="section-title">Outcomes &amp; Priors</h2>
            <button className="btn-secondary" onClick={market.addOutcome}>+ Add Outcome</button>
          </div>

          <div className="outcomes-list">
            {market.outcomes.map((name, i) => (
              <div
                key={market.outcomeIds[i]}
                className="outcome-row"
                style={{ borderLeftColor: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }}
              >
                <div className="outcome-header">
                  <input
                    className="outcome-name-input"
                    value={name}
                    onChange={e => {
                      const newOutcomes = [...market.outcomes];
                      newOutcomes[i] = e.target.value;
                      market.setOutcomes(newOutcomes);
                    }}
                  />
                  {market.outcomes.length > 2 && (
                    <button
                      className="btn-danger-sm"
                      onClick={() => market.removeOutcome(i)}
                    >×</button>
                  )}
                </div>
                <div className="outcome-controls">
                  <div className="ctrl-row">
                    <span className="ctrl-label">
                      Prior <MathFormula formula={`P_{${i + 1}}`} />
                    </span>
                    <input
                      type="range"
                      min={0.001}
                      max={0.999}
                      step={0.001}
                      value={market.priors[i]}
                      onChange={e => market.updatePrior(i, parseFloat(e.target.value))}
                      className="slider-sm"
                    />
                    <span className="ctrl-val">{market.priors[i].toFixed(3)}</span>
                  </div>
                  <div className="ctrl-row">
                    <span className="ctrl-label">
                      Shares <MathFormula formula={`q_{${i + 1}}`} />
                    </span>
                    <input
                      type="range"
                      min={-20}
                      max={20}
                      step={0.1}
                      value={market.qs[i]}
                      onChange={e => {
                        const newQs = [...market.qs];
                        newQs[i] = parseFloat(e.target.value);
                        market.setQs(newQs);
                      }}
                      className="slider-sm"
                    />
                    <span className="ctrl-val">{market.qs[i].toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel stats-panel">
          <h2 className="section-title">Live Market State</h2>

          <div className="stats-grid">
            <div className="stat-card highlight">
              <span className="stat-label">Cost C(q)</span>
              <span className="stat-value mono">{fmt(market.cost)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Entropy H(p)</span>
              <span className="stat-value mono">{fmt(market.entropy)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">KL(p_q || P)</span>
              <span className="stat-value mono">{fmt(market.kl)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Legendre Check</span>
              <span className="stat-value mono">{fmt(market.legendreVal)}</span>
              <span className="stat-hint">approximately C(q) always</span>
            </div>
            {balance !== null && (
              <div className={`stat-card balance-card${balance < market.pendingTradeCost ? ' balance-low' : ''}`}>
                <span className="stat-label">Balance</span>
                <span className="stat-value mono">${fmt(balance)}</span>
                {balance < market.pendingTradeCost && (
                  <span className="stat-hint balance-warn">Insufficient for this trade</span>
                )}
              </div>
            )}
          </div>

          <h3 className="subsection-title">
            Market Prices <MathFormula formula="p_i" />
          </h3>
          <div className="prices-list">
            {market.outcomes.map((name, i) => (
              <div key={market.outcomeIds[i]} className="price-row">
                <span className="price-label">{name}</span>
                <div className="price-bar-wrap">
                  <div
                    className="price-bar"
                    style={{
                      width: `${(market.prices[i] * 100).toFixed(2)}%`,
                      background: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
                    }}
                  />
                </div>
                <span className="price-val">{(market.prices[i] * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>

          <h3 className="subsection-title">
            Execute Trade <MathFormula formula={String.raw`\Delta q`} />
          </h3>
          <div className="trade-inputs">
            {market.outcomes.map((name, i) => (
              <div key={market.outcomeIds[i]} className="trade-row">
                <span className="trade-label">{name}</span>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={0.1}
                  value={market.deltaQs[i]}
                  onChange={e => {
                    const newDeltaQs = [...market.deltaQs];
                    newDeltaQs[i] = parseFloat(e.target.value);
                    market.setDeltaQs(newDeltaQs);
                  }}
                  className="slider-sm"
                />
                <input
                  type="number"
                  className="num-input-sm"
                  value={market.deltaQs[i]}
                  step={0.1}
                  onChange={e => {
                    const newDeltaQs = [...market.deltaQs];
                    newDeltaQs[i] = parseFloat(e.target.value) || 0;
                    market.setDeltaQs(newDeltaQs);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="trade-footer">
            <div className={`trade-cost ${market.pendingTradeCost >= 0 ? 'positive' : 'negative'}`}>
              Trade Cost: {market.pendingTradeCost >= 0 ? '+' : ''}{fmt(market.pendingTradeCost)}
            </div>
            {tradeError && <span className="trade-error">{tradeError}</span>}
            <div className="trade-actions">
              <button
                className="btn-primary"
                onClick={onExecuteTrade}
                disabled={balance !== null && balance < market.pendingTradeCost}
              >
                Execute Trade
              </button>
              <button className="btn-secondary" onClick={market.resetMarket}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <PriceEvolutionChart
          priceHistory={market.priceHistory}
          outcomes={market.outcomes}
          darkMode={darkMode}
        />
        <CostEvolutionChart costHistory={market.costHistory} darkMode={darkMode} />
      </div>

      <div className="advanced-section">
        <button className="toggle-section-btn" onClick={() => setShowAdvanced(a => !a)}>
          {showAdvanced ? '▼' : '▶'} Advanced Visualizations
        </button>
        {showAdvanced && (
          <div className="advanced-content">
            <TiltingVisualizationChart
              priors={market.priors}
              prices={market.prices}
              outcomes={market.outcomes}
              darkMode={darkMode}
            />
            <div className="panel">
              <h2 className="section-title">Information-Theoretic Breakdown</h2>
              <p className="panel-desc">
                Legendre-Fenchel identity verification: C(q) = E[q] - beta * KL(p_q || P)
              </p>
              <div className="info-theory-grid">
                <div className="stat-card">
                  <span className="stat-label">
                    <MathFormula formula={String.raw`\mathbb{E}_{p_q}[q]`} />
                  </span>
                  <span className="stat-value mono">
                    {fmt(market.qs.reduce((acc, q, i) => acc + q * market.prices[i], 0))}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">
                    <MathFormula formula={String.raw`\beta \cdot D_{\mathrm{KL}}(p_q \| P)`} />
                  </span>
                  <span className="stat-value mono">{fmt(market.beta * market.kl)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Legendre value</span>
                  <span className="stat-value mono">{fmt(market.legendreVal)}</span>
                </div>
                <div className="stat-card highlight">
                  <span className="stat-label">Direct C(q)</span>
                  <span className="stat-value mono">{fmt(market.cost)}</span>
                </div>
              </div>
              <div className="convexity-note">
                <strong>Convexity:</strong> The Hessian of C(q) is the Fisher information matrix{' '}
                <MathFormula formula={String.raw`\frac{1}{\beta}(\mathrm{diag}(p) - pp^\top) \succeq 0`} />, ensuring no-arbitrage.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="advanced-section">
        <button className="toggle-section-btn" onClick={() => setShowContinuous(c => !c)}>
          {showContinuous ? '▼' : '▶'} Continuous Outcome Approximation (Monte Carlo)
        </button>
        {showContinuous && <ContinuousMode beta={market.beta} darkMode={darkMode} />}
      </div>

      {market.tradeLog.length > 0 && (
        <div className="panel">
          <h2 className="section-title">Trade History</h2>
          <div className="trade-log">
            <div className="trade-log-header">
              <span>Time</span>
              <span>Delta q</span>
              <span>Cost Paid</span>
              <span>New Prices</span>
            </div>
            {market.tradeLog.map((entry, idx) => (
              <div key={idx} className="trade-log-row">
                <span className="mono small">{entry.timestamp}</span>
                <span className="mono small">[{entry.deltaQs.map(d => d.toFixed(1)).join(', ')}]</span>
                <span className={`mono small ${entry.tradeCost >= 0 ? 'positive' : 'negative'}`}>
                  {entry.tradeCost >= 0 ? '+' : ''}{fmt(entry.tradeCost, 4)}
                </span>
                <span className="mono small">
                  [{entry.newPrices.map(p => (p * 100).toFixed(1) + '%').join(', ')}]
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="advanced-section">
        <button className="toggle-section-btn" onClick={() => setShowEducation(e => !e)}>
          {showEducation ? '▼' : '▶'} Educational Reference
        </button>
        {showEducation && <EducationPanel darkMode={darkMode} />}
      </div>

      <MarketMakingPanel
        userId={userId}
        balance={balance}
        onBalanceChange={onBalanceChange}
      />

      <GeneralMeasurePanel
        userId={userId}
        balance={balance}
        onBalanceChange={onBalanceChange}
      />
    </>
  );
}
