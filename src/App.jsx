import { useState } from 'react';
import { useMarketState } from './hooks/useMarketState';
import MathFormula from './components/MathFormula';
import { PriceEvolutionChart, CostEvolutionChart, TiltingVisualizationChart } from './components/Charts';
import EducationPanel from './components/EducationPanel';
import ContinuousMode from './components/ContinuousMode';
import './App.css';
import { fmt } from './math/formatNumber';

const OUTCOME_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [showContinuous, setShowContinuous] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showEducation, setShowEducation] = useState(false);

  const market = useMarketState();

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <header className="header">
        <div className="header-inner">
          <div className="header-title">
            <span className="header-icon">⚡</span>
            <div>
              <h1 className="app-title">Gibbs Prediction Market</h1>
              <p className="app-subtitle">Log-Partition Cost Function · LMSR · Exponential Families</p>
            </div>
          </div>
          <button
            className="toggle-btn"
            onClick={() => setDarkMode(d => !d)}
            title="Toggle dark/light mode"
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      <main className="main">
        <div className="formula-banner">
          <MathFormula
            formula="C(q) = \beta \ln \sum_{i=1}^n P_i \, e^{q_i/\beta}"
            display
          />
        </div>

        {/* Beta Control */}
        <div className="panel beta-panel">
          <div className="beta-row">
            <div className="beta-info">
              <label className="beta-label">
                Liquidity Parameter <MathFormula formula="\beta" />
                <span className="beta-val">{market.beta.toFixed(2)}</span>
              </label>
              <p className="beta-desc">
                Higher β → more liquid (prices less sensitive) · Lower β → less liquid (prices very sensitive)
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

        {/* Main Grid */}
        <div className="main-grid">
          {/* Outcomes Panel */}
          <div className="panel outcomes-panel">
            <div className="panel-header">
              <h2 className="section-title">Outcomes &amp; Priors</h2>
              <button className="btn-secondary" onClick={market.addOutcome}>+ Add Outcome</button>
            </div>

            <div className="outcomes-list">
              {market.outcomes.map((name, i) => (
                <div
                  key={i}
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
                        Prior <MathFormula formula={`P_{${i+1}}`} />
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
                        Shares <MathFormula formula={`q_{${i+1}}`} />
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

          {/* Live Stats Panel */}
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
                <span className="stat-label">KL(p_q ‖ P)</span>
                <span className="stat-value mono">{fmt(market.kl)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Legendre Check</span>
                <span className="stat-value mono">{fmt(market.legendreVal)}</span>
                <span className="stat-hint">≈ C(q) always</span>
              </div>
            </div>

            <h3 className="subsection-title">
              Market Prices <MathFormula formula="p_i" />
            </h3>
            <div className="prices-list">
              {market.outcomes.map((name, i) => (
                <div key={i} className="price-row">
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
              Execute Trade <MathFormula formula="\Delta q" />
            </h3>
            <div className="trade-inputs">
              {market.outcomes.map((name, i) => (
                <div key={i} className="trade-row">
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
              <div className="trade-actions">
                <button className="btn-primary" onClick={market.executeTrade}>
                  Execute Trade
                </button>
                <button className="btn-secondary" onClick={market.resetMarket}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="charts-grid">
          <PriceEvolutionChart
            priceHistory={market.priceHistory}
            outcomes={market.outcomes}
            darkMode={darkMode}
          />
          <CostEvolutionChart costHistory={market.costHistory} darkMode={darkMode} />
        </div>

        {/* Advanced Section */}
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
                  Legendre–Fenchel identity verification: C(q) = E[q] − β·KL(p_q ‖ P)
                </p>
                <div className="info-theory-grid">
                  <div className="stat-card">
                    <span className="stat-label">
                      <MathFormula formula="\mathbb{E}_{p_q}[q]" />
                    </span>
                    <span className="stat-value mono">
                      {fmt(market.qs.reduce((acc, q, i) => acc + q * market.prices[i], 0))}
                    </span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">
                      <MathFormula formula="\beta \cdot D_{\mathrm{KL}}(p_q \| P)" />
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
                  <MathFormula formula="\frac{1}{\beta}(\mathrm{diag}(p) - pp^\top) \succeq 0" />,
                  ensuring no-arbitrage.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Continuous Mode */}
        <div className="advanced-section">
          <button className="toggle-section-btn" onClick={() => setShowContinuous(c => !c)}>
            {showContinuous ? '▼' : '▶'} Continuous Outcome Approximation (Monte Carlo)
          </button>
          {showContinuous && <ContinuousMode beta={market.beta} darkMode={darkMode} />}
        </div>

        {/* Trade History */}
        {market.tradeLog.length > 0 && (
          <div className="panel">
            <h2 className="section-title">Trade History</h2>
            <div className="trade-log">
              <div className="trade-log-header">
                <span>Time</span>
                <span>Δq</span>
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

        {/* Education */}
        <div className="advanced-section">
          <button className="toggle-section-btn" onClick={() => setShowEducation(e => !e)}>
            {showEducation ? '▼' : '▶'} 📚 Educational Reference
          </button>
          {showEducation && <EducationPanel darkMode={darkMode} />}
        </div>
      </main>

      <footer className="footer">
        <p>
          Gibbs Prediction Market &middot; Log-partition cost function &middot;{' '}
          <MathFormula formula="C(q) = \beta \ln \mathbb{E}_P[e^{q/\beta}]" />
        </p>
      </footer>
    </div>
  );
}
