const fs = require('fs');

const path = 'backend/src/services/graph/loader.ts';
let code = fs.readFileSync(path, 'utf8');

const calcTokenScoreStr = `
function calcTokenScore(label: string, labelTokenSet: Set<string>, tokens: readonly string[], node: Node): number {
  if (tokens.length === 0) return 0;
  
  let score = 0;
  let matched = 0;
  for (const t of tokens) {
    if (STOPWORDS.has(t)) {
      matched += 1;
      continue;
    }
    if (labelTokenSet.has(t)) matched += 1;
    else if (label.includes(t)) matched += 0.5;
  }
  const ratio = matched / tokens.length;
  score += ratio * 300;

  // Whole-word numeric match is decisive for seating sections / gates.
  for (const t of tokens) {
    if (/^\\d+$/.test(t) && labelTokenSet.has(t)) {
      score += node.type === 'seating_section' ? 500 : 250;
    }
  }
  return score;
}
`;

const searchStr = `  if (tokens.length > 0) {
    const labelTokens = label.split(' ');
    const labelTokenSet = new Set(labelTokens);
    let matched = 0;
    for (const t of tokens) {
      if (STOPWORDS.has(t)) {
        matched += 1;
        continue;
      }
      if (labelTokenSet.has(t)) matched += 1;
      else if (label.includes(t)) matched += 0.5;
    }
    const ratio = matched / tokens.length;
    score += ratio * 300;

    // Whole-word numeric match is decisive for seating sections / gates.
    for (const t of tokens) {
      if (/^\\d+$/.test(t) && labelTokenSet.has(t)) {
        score += node.type === 'seating_section' ? 500 : 250;
      }
    }
  }`;

const replaceStr = `  if (tokens.length > 0) {
    const labelTokens = label.split(' ');
    const labelTokenSet = new Set(labelTokens);
    score += calcTokenScore(label, labelTokenSet, tokens, node);
  }`;

code = code.replace(searchStr, replaceStr);

code = code.replace('function scoreNode', calcTokenScoreStr + '\nfunction scoreNode');

fs.writeFileSync(path, code);
