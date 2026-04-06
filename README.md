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
npm run dev:all
```

This now starts:

- Frontend (Vite) on `http://localhost:5173`
- Backend API on `http://localhost:4000`

If you want to run them separately:

```bash
npm run server   # API only
npm run dev      # frontend only
```

## Authentication

- `POST /api/auth/register` creates an account with bcrypt-hashed passwords
- `POST /api/auth/login` authenticates and sets an HTTP-only JWT cookie session
- `POST /api/auth/refresh` rotates refresh token and issues a new short-lived access token
- `POST /api/auth/request-verification` sends a new email verification token
- `POST /api/auth/verify-email` verifies email using token
- `POST /api/auth/request-password-reset` sends a password reset token
- `POST /api/auth/reset-password` sets a new password from reset token
- `GET /api/auth/me` validates the current session
- `POST /api/auth/logout` clears the auth cookie

Session model:

- Access token cookie is short-lived (`15m`)
- Refresh token cookie is long-lived (`7d`) and rotated on refresh
- Logout revokes the stored refresh token record

### Email Configuration

Email verification and password reset tokens are sent through SMTP. Configure:

- `APP_BASE_URL` (example: `http://localhost:5173`)
- `SMTP_PROVIDER` (`custom`, `resend`, `sendgrid`, `postmark`, or `mailgun`)
- `EMAIL_FROM` (example: `noreply@example.com`)
- `SMTP_HOST`
- `SMTP_PORT` (example: `587`)
- `SMTP_SECURE` (`true` or `false`)
- `SMTP_USER`
- `SMTP_PASS`

Also set:

- `JWT_SECRET` (required for production)

If SMTP is not configured, token emails are skipped and authentication recovery flows will not deliver tokens.

SMTP self-test health endpoint:

- `GET /api/health/email` returns SMTP configuration/test status (provider, host, port, secure, and last error)

User accounts and per-user market state are stored locally in:

- `server/data/users.json`
- `server/data/marketStates.json`

## Tech Stack

- **React** + **Vite** — reactive UI with instant recomputation
- **KaTeX** — LaTeX math rendering
- **Recharts** — interactive charts
- Pure JavaScript mathematical engine (no numerical libraries)
