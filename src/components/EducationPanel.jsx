import MathFormula from './MathFormula';

const SECTIONS = [
  {
    title: 'What is this market?',
    content: (
      <div>
        <p>
          This is a <strong>Logarithmic Market Scoring Rule (LMSR)</strong> generalized to arbitrary
          probability spaces. It is a <em>prediction market</em> where participants can buy and sell
          shares on outcomes, and prices always reflect a probability distribution.
        </p>
        <p className="mt-2">
          The market is operated by a <em>market maker</em> using the <strong>log-partition cost
          function</strong>:
        </p>
        <div className="math-block">
          <MathFormula
            formula="C(q) = \\beta \\ln \\mathbb{E}_P\\!\\left[e^{q/\\beta}\\right]"
            display
          />
        </div>
      </div>
    ),
  },
  {
    title: 'Why do prices form a probability distribution?',
    content: (
      <div>
        <p>The price of outcome <MathFormula formula="\\omega_i" /> is defined as:</p>
        <div className="math-block">
          <MathFormula
            formula="p_i = \\frac{P_i \\, e^{q_i/\\beta}}{\\sum_j P_j \\, e^{q_j/\\beta}}"
            display
          />
        </div>
        <p className="mt-2">
          By construction, <MathFormula formula="p_i > 0" /> for all <MathFormula formula="i" />{' '}
          and <MathFormula formula="\\sum_i p_i = 1" />, so prices always form a valid probability
          distribution. This is the <strong>Radon–Nikodym derivative</strong> of the exponentially
          tilted measure <MathFormula formula="P_q" /> with respect to <MathFormula formula="P" />.
        </p>
      </div>
    ),
  },
  {
    title: 'Why does β control liquidity?',
    content: (
      <div>
        <p>
          As <MathFormula formula="\\beta \\to 0" />, the tilted distribution concentrates all mass
          on the outcome with the highest <MathFormula formula="q_i" /> (winner-takes-all).
          Trades cause extreme price movements — low liquidity.
        </p>
        <p className="mt-2">
          As <MathFormula formula="\\beta \\to \\infty" />, prices converge to the prior{' '}
          <MathFormula formula="P_i" /> regardless of shares. Trades barely move prices — high
          liquidity (infinite depth).
        </p>
        <p className="mt-2">
          The parameter <MathFormula formula="\\beta" /> is the <em>temperature</em> of the
          exponential family, trading off sensitivity vs. stability.
        </p>
      </div>
    ),
  },
  {
    title: 'Connection to Exponential Families',
    content: (
      <div>
        <p>
          The tilted measure <MathFormula formula="P_q" /> is an <strong>exponential family</strong>{' '}
          with natural parameter <MathFormula formula="q/\\beta" /> and base measure{' '}
          <MathFormula formula="P" />. The cost function <MathFormula formula="C(q)" /> is exactly
          the <strong>log-partition function</strong> (cumulant generating function) of this family.
        </p>
        <p className="mt-2">
          The gradient of the log-partition function gives the expected value of the sufficient
          statistic — here, the market prices:
        </p>
        <div className="math-block">
          <MathFormula formula="\\nabla C(q) = p_q" display />
        </div>
      </div>
    ),
  },
  {
    title: 'Legendre–Fenchel Duality & KL Divergence',
    content: (
      <div>
        <p>
          The cost function admits a beautiful variational representation via the{' '}
          <strong>Legendre–Fenchel transform</strong>:
        </p>
        <div className="math-block">
          <MathFormula
            formula="C(q) = \\sup_{\\mu} \\left( \\int q \\, d\\mu - \\beta D_{\\mathrm{KL}}(\\mu \\| P) \\right)"
            display
          />
        </div>
        <p className="mt-2">
          The supremum is achieved at <MathFormula formula="\\mu^* = P_q" /> (the tilted measure).
          This means <MathFormula formula="C(q)" /> equals{' '}
          <MathFormula formula="\\mathbb{E}_{P_q}[q] - \\beta D_{\\mathrm{KL}}(P_q \\| P)" />.
        </p>
        <p className="mt-2">
          This connects prediction markets to <strong>entropic risk measures</strong> and
          information geometry.
        </p>
      </div>
    ),
  },
  {
    title: 'Why C(q) is Convex',
    content: (
      <div>
        <p>
          The cost function <MathFormula formula="C(q)" /> is <strong>convex</strong> in{' '}
          <MathFormula formula="q" />. This is because it is a log-sum-exp of linear functions,
          which is a standard convex function.
        </p>
        <p className="mt-2">
          Its Hessian is the <strong>Fisher information matrix</strong> of the exponential family:
        </p>
        <div className="math-block">
          <MathFormula
            formula="\\nabla^2 C(q) = \\frac{1}{\\beta}(\\mathrm{diag}(p_q) - p_q p_q^\\top)"
            display
          />
        </div>
        <p className="mt-2">
          Convexity ensures no arbitrage: you cannot buy and sell to make riskless profit.
        </p>
      </div>
    ),
  },
  {
    title: 'Interpretation as Entropic Risk Measure',
    content: (
      <div>
        <p>
          The cost function can be written as:
        </p>
        <div className="math-block">
          <MathFormula
            formula="C(q) = \\beta \\cdot \\rho_{-q/\\beta}^{\\mathrm{ent}}"
            display
          />
        </div>
        <p className="mt-2">
          where <MathFormula formula="\\rho^{\\mathrm{ent}}" /> is the <strong>entropic risk
          measure</strong>. The market maker&apos;s worst-case expected loss corresponds to the
          entropic risk of the share vector, connecting prediction markets to{' '}
          <strong>robust statistics</strong> and <strong>financial risk management</strong>.
        </p>
      </div>
    ),
  },
];

export default function EducationPanel() {
  return (
    <div className="edu-panel">
      <h2 className="section-title">📚 Educational Reference</h2>
      <div className="edu-sections">
        {SECTIONS.map((section, idx) => (
          <details key={idx} className="edu-section">
            <summary className="edu-summary">{section.title}</summary>
            <div className="edu-content">{section.content}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
