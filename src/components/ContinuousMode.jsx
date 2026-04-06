import { useState } from 'react';
import { computeContinuousCost } from '../math/marketMath';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

export default function ContinuousMode({ beta, darkMode }) {
  const [qMean, setQMean] = useState(0);
  const [qStd, setQStd] = useState(1);
  const [numSamples, setNumSamples] = useState(300);
  const [result, setResult] = useState(null);

  const textColor = darkMode ? '#94a3b8' : '#64748b';
  const gridColor = darkMode ? '#1e293b' : '#e2e8f0';

  const runSimulation = () => {
    const res = computeContinuousCost(beta, numSamples, qMean, qStd);
    setResult(res);
  };

  const scatterData = result
    ? result.samples.map((s, i) => ({
        omega: parseFloat(s.omega.toFixed(3)),
        weight: parseFloat(result.normalizedWeights[i].toFixed(5)),
      }))
    : [];

  return (
    <div className="panel">
      <h2 className="section-title">🔬 Continuous Outcome Approximation</h2>
      <p className="panel-desc">
        Approximate the integral over a continuous outcome space Ω = ℝ using Monte Carlo sampling
        from the standard normal prior P = N(0,1). The payoff function is q(ω) = μ + σ·ω.
      </p>
      <div className="controls-row">
        <label className="control-label">
          q mean (μ)
          <input
            type="number"
            className="num-input"
            value={qMean}
            step={0.1}
            onChange={e => setQMean(parseFloat(e.target.value) || 0)}
          />
        </label>
        <label className="control-label">
          q std (σ)
          <input
            type="number"
            className="num-input"
            value={qStd}
            step={0.1}
            min={0.01}
            onChange={e => setQStd(parseFloat(e.target.value) || 0.1)}
          />
        </label>
        <label className="control-label">
          Samples
          <input
            type="number"
            className="num-input"
            value={numSamples}
            step={100}
            min={50}
            max={2000}
            onChange={e => setNumSamples(parseInt(e.target.value) || 300)}
          />
        </label>
        <button className="btn-primary" onClick={runSimulation}>
          Run Simulation
        </button>
      </div>

      {result && (
        <div>
          <div className="stat-row mt-2">
            <div className="stat-card">
              <span className="stat-label">Estimated C(q)</span>
              <span className="stat-value">{result.cost.toFixed(6)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Theoretical C(q)</span>
              <span className="stat-value">
                {(beta * (qMean / beta + (qStd * qStd) / (2 * beta * beta))).toFixed(6)}
              </span>
              <span className="stat-hint">β(μ/β + σ²/2β²) for Gaussian</span>
            </div>
          </div>
          <div className="chart-container mt-2">
            <h3 className="chart-title">Tilted Weights vs Outcome ω</h3>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="omega"
                  name="ω"
                  tick={{ fill: textColor, fontSize: 11 }}
                  label={{ value: 'ω', position: 'insideRight', fill: textColor }}
                />
                <YAxis
                  dataKey="weight"
                  name="weight"
                  tick={{ fill: textColor, fontSize: 11 }}
                  label={{ value: 'w', angle: -90, position: 'insideLeft', fill: textColor }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    background: darkMode ? '#1e293b' : '#ffffff',
                    border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                    borderRadius: 8,
                    color: darkMode ? '#f1f5f9' : '#0f172a',
                  }}
                />
                <Scatter data={scatterData} fill="#6366f1" opacity={0.5} r={2} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
