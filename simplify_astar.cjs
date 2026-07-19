const fs = require('fs');

const path = 'backend/src/services/graph/astar.ts';
let code = fs.readFileSync(path, 'utf8');

const computePathStr = `
function computePath(
  graph: GraphIndex,
  fromNodeId: string,
  toNodeId: string,
  mode: RoutingMode,
  crowdPenalty: CrowdPenalty,
  blockedNode: BlockedNode
): { path: string[]; pathEdges: Edge[] } | null {
  const goal = graph.nodes.get(toNodeId);
  if (!goal) return null;

  const heuristic = (nodeId: string): number => {
    const node = graph.nodes.get(nodeId);
    if (!node) return 0;
    return haversineMeters(node.coords, goal.coords) / WALK_SPEED_MPS;
  };

  const gScore = new Map<string, number>([[fromNodeId, 0]]);
  const cameFrom = new Map<string, { prev: string; edge: Edge }>();
  const closed = new Set<string>();
  const open = new MinHeap();
  let seq = 0;
  open.push(heuristic(fromNodeId), seq++, fromNodeId);

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === toNodeId) break;
    if (closed.has(current)) continue;
    closed.add(current);

    const g = gScore.get(current)!;
    const edges = graph.edgesFrom.get(current);
    if (!edges) continue;

    for (const edge of edges) {
      if (closed.has(edge.to) || blockedNode(edge.to)) continue;
      const tentative = g + edgeWeight(edge, mode, crowdPenalty);
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, { prev: current, edge });
        gScore.set(edge.to, tentative);
        open.push(tentative + heuristic(edge.to), seq++, edge.to);
      }
    }
  }

  if (!cameFrom.has(toNodeId)) return null;

  const pathEdges: Edge[] = [];
  const path: string[] = [toNodeId];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    const link = cameFrom.get(cursor);
    if (!link) return null;
    pathEdges.unshift(link.edge);
    path.unshift(link.prev);
    cursor = link.prev;
  }

  return { path, pathEdges };
}
`;

const replaceStr = `  const result = computePath(graph, fromNodeId, toNodeId, mode, crowdPenalty, blockedNode);
  if (!result) return null;
  const { path, pathEdges } = result;`;

const searchStr = `  const heuristic = (nodeId: string): number => {
    const node = graph.nodes.get(nodeId);
    if (!node) return 0;
    return haversineMeters(node.coords, goal.coords) / WALK_SPEED_MPS;
  };

  const gScore = new Map<string, number>([[fromNodeId, 0]]);
  const cameFrom = new Map<string, { prev: string; edge: Edge }>();
  const closed = new Set<string>();
  const open = new MinHeap();
  let seq = 0;
  open.push(heuristic(fromNodeId), seq++, fromNodeId);

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === toNodeId) break;
    if (closed.has(current)) continue;
    closed.add(current);

    const g = gScore.get(current)!;
    const edges = graph.edgesFrom.get(current);
    if (!edges) continue;

    for (const edge of edges) {
      if (closed.has(edge.to) || blockedNode(edge.to)) continue;
      const tentative = g + edgeWeight(edge, mode, crowdPenalty);
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, { prev: current, edge });
        gScore.set(edge.to, tentative);
        open.push(tentative + heuristic(edge.to), seq++, edge.to);
      }
    }
  }

  if (!cameFrom.has(toNodeId)) return null;

  // Reconstruct the path (node ids) and the edges taken, origin-first.
  const pathEdges: Edge[] = [];
  const path: string[] = [toNodeId];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    const link = cameFrom.get(cursor);
    if (!link) return null; // defensive; shouldn't happen given the has() check above
    pathEdges.unshift(link.edge);
    path.unshift(link.prev);
    cursor = link.prev;
  }`;

code = code.replace(searchStr, replaceStr);
code = code.replace('export function route', computePathStr + '\nexport function route');

fs.writeFileSync(path, code);
