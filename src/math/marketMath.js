/**
 * Mathematical engine for the log-partition prediction market.
 *
 * Cost function:
 *   C(q) = beta * ln( sum_i P_i * exp(q_i / beta) )
 *
 * Prices (Radon–Nikodym derivative of the tilted measure):
 *   p_i = P_i * exp(q_i / beta) / Z(q)
 *   where Z(q) = sum_j P_j * exp(q_j / beta)
 */

/**
 * Compute log-sum-exp stably:
 *   log( sum_i w_i * exp(x_i) )
 * where w_i are weights (e.g., prior probs) and x_i = q_i / beta.
 */
function logSumExpWeighted(qs, priors, beta) {
  const xs = qs.map((q, i) => Math.log(priors[i]) + q / beta);
  const maxX = Math.max(...xs);
  const sumExp = xs.reduce((acc, x) => acc + Math.exp(x - maxX), 0);
  return maxX + Math.log(sumExp);
}

/**
 * Compute the cost function C(q).
 * C(q) = beta * ln( sum_i P_i * exp(q_i / beta) )
 */
export function computeCost(qs, priors, beta) {
  return beta * logSumExpWeighted(qs, priors, beta);
}

/**
 * Compute marginal prices p_i = P_i * exp(q_i/beta) / Z.
 * Returns an array of probabilities that sum to 1.
 */
export function computePrices(qs, priors, beta) {
  const logZ = logSumExpWeighted(qs, priors, beta);
  return qs.map((q, i) => {
    const logNumer = Math.log(priors[i]) + q / beta;
    return Math.exp(logNumer - logZ);
  });
}

/**
 * Compute trade cost: C(q + deltaQ) - C(q).
 */
export function computeTradeCost(qs, deltaQs, priors, beta) {
  const newQs = qs.map((q, i) => q + (deltaQs[i] || 0));
  return computeCost(newQs, priors, beta) - computeCost(qs, priors, beta);
}

/**
 * KL divergence from measure mu to P:
 *   D_KL(mu || P) = sum_i mu_i * ln(mu_i / P_i)
 */
export function computeKLDivergence(mu, priors) {
  return mu.reduce((acc, m, i) => {
    if (m <= 0) return acc;
    return acc + m * Math.log(m / priors[i]);
  }, 0);
}

/**
 * Shannon entropy of a distribution:
 *   H(mu) = -sum_i mu_i * ln(mu_i)
 */
export function computeEntropy(mu) {
  return -mu.reduce((acc, m) => {
    if (m <= 0) return acc;
    return acc + m * Math.log(m);
  }, 0);
}

/**
 * Verify the Legendre-Fenchel relation:
 *   C(q) = sup_mu ( sum_i q_i * mu_i - beta * D_KL(mu || P) )
 * At optimum mu = p_q (the tilted measure), this equals C(q).
 * Returns the value at the current prices (should equal C(q)).
 */
export function computeLegendreValue(qs, priors, beta) {
  const prices = computePrices(qs, priors, beta);
  const dotProduct = qs.reduce((acc, q, i) => acc + q * prices[i], 0);
  const kl = computeKLDivergence(prices, priors);
  return dotProduct - beta * kl;
}

/**
 * Simulate continuous outcome via sampling from a normal distribution.
 * Returns {samples, cost, normalizedWeights}.
 */
export function computeContinuousCost(beta, numSamples = 500, qMean = 0, qStd = 1) {
  const samples = [];
  const logTerms = [];

  for (let i = 0; i < numSamples; i++) {
    // Box-Muller for N(0,1)
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random() || 1e-10;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const omega = z;
    const qOmega = qMean + qStd * omega;
    logTerms.push(qOmega / beta);
    samples.push({ omega, qOmega });
  }

  const maxLog = Math.max(...logTerms);
  const sumExp = logTerms.reduce((acc, l) => acc + Math.exp(l - maxLog), 0);
  const cost = beta * (maxLog + Math.log(sumExp / numSamples));

  const weights = logTerms.map(l => Math.exp(l - maxLog));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedWeights = weights.map(w => w / totalWeight);

  return { samples, cost, normalizedWeights };
}
