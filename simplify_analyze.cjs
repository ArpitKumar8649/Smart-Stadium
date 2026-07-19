const fs = require('fs');

const path = 'scripts/import-mappedin.ts';
let code = fs.readFileSync(path, 'utf8');

const computeComponentSizeStr = `
function computeComponentSize(startId: string, adj: Map<string, string[]>, seen: Set<string>): number {
  let size = 0;
  const stack = [startId];
  seen.add(startId);
  while (stack.length) {
    const cur = stack.pop()!;
    size++;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return size;
}
`;

const searchStr = `  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    components++;
    let size = 0;
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    if (size === 1) orphans++;
    largest = Math.max(largest, size);
  }`;

const replaceStr = `  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    components++;
    const size = computeComponentSize(n.id, adj, seen);
    if (size === 1) orphans++;
    largest = Math.max(largest, size);
  }`;

code = code.replace(searchStr, replaceStr);
code = code.replace('function analyzeConnectivity', computeComponentSizeStr + '\nfunction analyzeConnectivity');

fs.writeFileSync(path, code);
