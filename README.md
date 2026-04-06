# Gibbs Prediction Market

An interactive, mathematically rigorous prediction market based on the **log-partition cost function**:

$$C(q) = \beta \ln \mathbb{E}_P\!\left[e^{q/\beta}\right]$$

![Gibbs Prediction Market Screenshot](https://github.com/user-attachments/assets/8720827d-453d-4ae4-846a-32fa8ecb0e4a)

## Features

- **Mathematical Engine**: Exact implementation of the log-partition cost function, instantaneous prices, and trade costs
- **Interactive Dashboard**: Live sliders for β, priors, and share quantities with instant recomputation
- **Price Visualization**: Real-time bar charts for market probabilities and price evolution over trades
- **Information Theory Panel**: Live display of entropy H(p), KL divergence D_KL(p_q ‖ P), and Legendre–Fenchel identity verification
- **Exponential Tilting Visualization**: Side-by-side comparison of prior P vs. tilted measure P_q
- **Continuous Outcome Approximation**: Monte Carlo simulation over ℝ with normal prior
- **Trade History**: Log of all executed trades with cost and resulting prices
- **Educational Reference**: Expandable sections explaining the mathematics (exponential families, convexity, entropic risk measures)
- **Dark/Light Mode**: Minimalist fintech aesthetic with smooth transitions

## Mathematical Foundation

The market maker uses:

| Quantity | Formula |
|----------|---------|
| Cost function | $C(q) = \beta \ln \sum_i P_i e^{q_i/\beta}$ |
| Marginal price | $p_i = P_i e^{q_i/\beta} / Z(q)$ |
| Trade cost | $\text{Cost}(\Delta q) = C(q + \Delta q) - C(q)$ |
| Legendre–Fenchel | $C(q) = \sup_\mu \left( \mathbb{E}_\mu[q] - \beta D_{\mathrm{KL}}(\mu \| P) \right)$ |

## Quick Start

```bash
npm install
npm run dev
```

## Tech Stack

- **React** + **Vite** — reactive UI with instant recomputation
- **KaTeX** — LaTeX math rendering
- **Recharts** — interactive charts
- Pure JavaScript mathematical engine (no numerical libraries)
