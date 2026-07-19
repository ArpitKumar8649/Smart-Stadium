const fs = require('fs');

const path = 'backend/src/services/agent/tools/handlers/nearest.ts';
let code = fs.readFileSync(path, 'utf8');

const helperStr = `
function findReachableCandidate(candidates: Node[], fromId: string, mode: 'step_free' | 'fastest'): { chosen: Node | undefined; result: RouteResponse | null } {
  const graph = routerGraph(getGraph());
  const sim = getCrowdSimulator();
  let chosen: Node | undefined;
  let result: RouteResponse | null = null;
  for (const candidate of candidates) {
    const r = route(graph, fromId, candidate.id, mode, (id) => sim.crowdPenaltyForNode(id));
    if (r) {
      chosen = candidate;
      result = r;
      break;
    }
  }
  return { chosen, result };
}
`;

const replaceStr = `
  // Straight-line ranking is a prefilter; confirm with a real route and, if the
  // nearest is unreachable in the requested mode, fall through to the next.
  const mode = step_free ? 'step_free' : 'fastest';
  const { chosen, result } = findReachableCandidate(candidates, from.id, mode);
`;

const searchStr = `  // Straight-line ranking is a prefilter; confirm with a real route and, if the
  // nearest is unreachable in the requested mode, fall through to the next.
  const mode = step_free ? 'step_free' : 'fastest';
  const graph = routerGraph(getGraph());
  const sim = getCrowdSimulator();
  let chosen: Node | undefined;
  let result: RouteResponse | null = null;
  for (const candidate of candidates) {
    const r = route(graph, from.id, candidate.id, mode, (id) => sim.crowdPenaltyForNode(id));
    if (r) {
      chosen = candidate;
      result = r;
      break;
    }
  }`;

code = code.replace(searchStr, replaceStr);

// Add the new helper function above handleFindNearest
code = code.replace('export function handleFindNearest', helperStr + '\nexport function handleFindNearest');

fs.writeFileSync(path, code);
