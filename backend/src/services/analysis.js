const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const tokenize = (text) => (text.toLowerCase().match(/[a-z0-9']+/g) || []);

export function analyzeText(text) {
  const clean = String(text || '').trim();
  const words = tokenize(clean);
  if (words.length < 35) return { likelihood: 0, indicators: [], wordCount: words.length };
  const sentences = clean.split(/[.!?]+/).map((part) => tokenize(part).length).filter(Boolean);
  const average = sentences.reduce((sum, length) => sum + length, 0) / Math.max(1, sentences.length);
  const variance = sentences.reduce((sum, length) => sum + ((length - average) ** 2), 0) / Math.max(1, sentences.length);
  const diversity = new Set(words).size / words.length;
  const repeated = words.reduce((count, word, index) => count + (index > 0 && word === words[index - 1] ? 1 : 0), 0) / words.length;
  let score = 0;
  const indicators = [];
  if (sentences.length >= 3 && variance < 9) { score += 25; indicators.push('Sentence lengths show little variation'); }
  if (diversity > 0.62 && words.length > 70) { score += 20; indicators.push('High vocabulary variety for the answer length'); }
  if (average > 20 && sentences.length >= 3) { score += 15; indicators.push('Long, consistently structured sentences'); }
  if (repeated > 0.075) { score += 10; indicators.push('Repeated adjacent phrasing detected'); }
  const formalTransitions = (clean.match(/\b(furthermore|moreover|in conclusion|therefore|consequently|additionally)\b/gi) || []).length;
  if (formalTransitions >= 3) { score += 15; indicators.push('Several formal transition phrases'); }
  if (sentences.length >= 4 && variance < 16 && average >= 12) { score += 15; indicators.push('Consistent sentence structure'); }
  return { likelihood: clamp(score), indicators, wordCount: words.length };
}

export function similarityPercent(first, second) {
  const a = new Set(tokenize(first).filter((word) => word.length > 2));
  const b = new Set(tokenize(second).filter((word) => word.length > 2));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return clamp((overlap / (a.size + b.size - overlap)) * 100);
}

export function riskLabel(score) {
  if (score >= 80) return 'Very high';
  if (score >= 60) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

export function summarizeAttempt(events, answerRows) {
  const reasons = new Set();
  const eventCount = (type) => events.filter((event) => event.event_type === type).length;
  let score = 0;
  if (eventCount('PASTE_DETECTED')) { score += 25; reasons.add('Paste activity recorded'); }
  if (eventCount('LARGE_TEXT_INSERTION')) { score += 20; reasons.add('Large text insertion recorded'); }
  const tabSwitches = eventCount('TAB_SWITCH');
  if (tabSwitches) { score += Math.min(20, tabSwitches * 10); reasons.add(`${tabSwitches} tab switch${tabSwitches === 1 ? '' : 'es'} recorded`); }
  if (events.some((event) => event.event_type === 'TAB_SWITCH' && Number(event.details?.durationSeconds || 0) >= 30)) {
    score += 15; reasons.add('A tab switch lasted at least 30 seconds');
  }
  if (eventCount('HIGH_TYPING_SPEED')) { score += 10; reasons.add('High typing speed indicator recorded'); }
  if (eventCount('EXCESSIVE_BACKSPACE')) { score += 10; reasons.add('Frequent answer deletions recorded'); }
  if (events.some((event) => event.event_type === 'LONG_PAUSE')) { score += 5; reasons.add('A long pause was recorded'); }
  const answers = answerRows.map((row) => ({ ...row, text: row.answer_text || '' }));
  let highestAi = 0;
  let highestSimilarity = 0;
  const aiResults = [];
  for (const answer of answers) {
    const ai = analyzeText(answer.text);
    highestAi = Math.max(highestAi, ai.likelihood);
    aiResults.push({ questionId: answer.question_id, ...ai });
    for (const other of answers) {
      if (answer.question_id === other.question_id && answer.id !== other.id && other.text) {
        highestSimilarity = Math.max(highestSimilarity, similarityPercent(answer.text, other.text));
      }
    }
  }
  if (highestAi >= 60) { score += 20; reasons.add(`Heuristic AI likelihood reached ${highestAi}%`); }
  if (highestSimilarity >= 70) { score += 15; reasons.add(`Answer similarity reached ${highestSimilarity}%`); }
  if (!reasons.size) reasons.add('No configured monitoring indicators crossed review thresholds');
  return {
    suspicionScore: clamp(score), aiLikelihood: highestAi, similarityScore: highestSimilarity,
    reasons: [...reasons], aiResults
  };
}
