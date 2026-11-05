/**
 * The most common year in a list (ties go to the higher year: a repeat module is usually lower).
 * Used to work out which year a student is in from the modules they joined (lib/studentYear.js).
 */
function mostCommonYear(years) {
  const n = new Map();
  for (const y of years) n.set(y, (n.get(y) || 0) + 1);
  let best = null;
  for (const [y, c] of n) if (best === null || c > n.get(best) || (c === n.get(best) && y > best)) best = y;
  return best;
}

module.exports = { mostCommonYear };
