import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function PriceEvolutionChart({ priceHistory, outcomes, darkMode }) {
  const textColor = darkMode ? '#94a3b8' : '#64748b';
  const gridColor = darkMode ? '#1e293b' : '#e2e8f0';

  return (
    <div className="chart-container">
      <h3 className="chart-title">Price Evolution</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={priceHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="step"
            label={{ value: 'Trade #', position: 'insideBottom', offset: -2, fill: textColor, fontSize: 11 }}
            tick={{ fill: textColor, fontSize: 11 }}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={v => v.toFixed(2)}
            tick={{ fill: textColor, fontSize: 11 }}
          />
          <Tooltip
            formatter={(value, name) => [value.toFixed(4), name]}
            contentStyle={{
              background: darkMode ? '#1e293b' : '#ffffff',
              border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              color: darkMode ? '#f1f5f9' : '#0f172a',
            }}
          />
          <Legend wrapperStyle={{ color: textColor, fontSize: 12 }} />
          {outcomes.map((outcome, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`p${i}`}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={outcome}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostEvolutionChart({ costHistory, darkMode }) {
  const textColor = darkMode ? '#94a3b8' : '#64748b';
  const gridColor = darkMode ? '#1e293b' : '#e2e8f0';

  return (
    <div className="chart-container">
      <h3 className="chart-title">Cost C(q) Evolution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={costHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="step"
            label={{ value: 'Trade #', position: 'insideBottom', offset: -2, fill: textColor, fontSize: 11 }}
            tick={{ fill: textColor, fontSize: 11 }}
          />
          <YAxis tickFormatter={v => v.toFixed(2)} tick={{ fill: textColor, fontSize: 11 }} />
          <Tooltip
            formatter={(value) => [value.toFixed(6), 'C(q)']}
            contentStyle={{
              background: darkMode ? '#1e293b' : '#ffffff',
              border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              color: darkMode ? '#f1f5f9' : '#0f172a',
            }}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke="#6366f1"
            fill="#6366f133"
            strokeWidth={2}
            name="C(q)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TiltingVisualizationChart({ priors, prices, outcomes, darkMode }) {
  const textColor = darkMode ? '#94a3b8' : '#64748b';
  const gridColor = darkMode ? '#1e293b' : '#e2e8f0';

  const data = outcomes.map((name, i) => ({
    name,
    'Prior P': parseFloat(priors[i].toFixed(4)),
    'Tilted P_q': parseFloat(prices[i].toFixed(4)),
  }));

  return (
    <div className="chart-container">
      <h3 className="chart-title">Exponential Tilting: P vs P_q</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="name" tick={{ fill: textColor, fontSize: 11 }} />
          <YAxis domain={[0, 1]} tickFormatter={v => v.toFixed(2)} tick={{ fill: textColor, fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: darkMode ? '#1e293b' : '#ffffff',
              border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              color: darkMode ? '#f1f5f9' : '#0f172a',
            }}
          />
          <Legend wrapperStyle={{ color: textColor, fontSize: 12 }} />
          <Line type="monotone" dataKey="Prior P" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
          <Line type="monotone" dataKey="Tilted P_q" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
