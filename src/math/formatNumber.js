/**
 * Format a number for display, avoiding -0.000000.
 */
export function fmt(value, decimals = 6) {
  // Avoid displaying negative zero
  const v = value === 0 ? 0 : value;
  return v.toFixed(decimals);
}
