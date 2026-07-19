const fs = require('fs');

const path = 'scripts/import-mappedin.ts';
let code = fs.readFileSync(path, 'utf8');

const helpersStr = `
function buildNodeLinks(locations: RawLocation[], spaces: Map<string, RawSpace>, rawNodes: RawNode[]) {
  const nodeExists = new Set(rawNodes.map((n) => n.properties.id));
  const nodeToLoc = new Map<string, RawLocation>();
  const mappedViaNodes = new Set<string>();
  const mappedViaSpace = new Set<string>();

  for (const loc of locations) {
    if (loc.hidden) continue;
    let linked = false;
    for (const n of loc.nodes ?? []) {
      if (!nodeExists.has(n.id)) continue;
      if (!nodeToLoc.has(n.id)) nodeToLoc.set(n.id, loc);
      linked = true;
    }
    if (linked) mappedViaNodes.add(loc.id);
  }

  const spaceToLoc = new Map<string, RawLocation>();
  for (const loc of locations) {
    if (loc.hidden || mappedViaNodes.has(loc.id)) continue;
    for (const poly of loc.polygons) {
      if (!spaceToLoc.has(poly.id)) spaceToLoc.set(poly.id, loc);
    }
  }
  for (const [spaceId, props] of spaces) {
    const loc = spaceToLoc.get(spaceId);
    if (!loc) continue;
    for (const nid of props.destinationNodes ?? []) {
      if (nodeExists.has(nid) && !nodeToLoc.has(nid)) {
        nodeToLoc.set(nid, loc);
        mappedViaSpace.add(loc.id);
      }
    }
  }

  return { nodeToLoc, mappedViaNodes, mappedViaSpace };
}

function buildNodesList(
  rawNodes: RawNode[],
  floors: Map<string, MapFloor>,
  nodeToLoc: Map<string, RawLocation>,
  locCategory: Map<string, string>
) {
  const nodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();
  const perType: Record<string, number> = {};
  const perFloorNodes: Record<string, number> = {};
  let poiCount = 0;

  for (const rn of rawNodes) {
    const p = rn.properties;
    const floor = floors.get(p.map);
    const floorName = floor?.name.trim() ?? p.map;
    perFloorNodes[floorName] = (perFloorNodes[floorName] ?? 0) + 1;

    const loc = nodeToLoc.get(p.id);
    let type: NodeType;
    let label: string;
    let accessibility: GraphNode['accessibility'];
    let halal: boolean | undefined;
    let vegetarian: boolean | undefined;

    if (loc) {
      const c = classifyLocation(loc, locCategory.get(loc.id));
      type = c.type;
      accessibility = c.accessibility;
      halal = c.halal;
      vegetarian = c.vegetarian;
      label = locationLabel(loc);
      poiCount++;
    } else {
      type = 'concourse_segment';
      label = \`\${floorName} walkway\`;
      accessibility = [];
    }
    perType[type] = (perType[type] ?? 0) + 1;

    const node: GraphNode = {
      id: p.id,
      type,
      label,
      level: floor?.elevation ?? 0,
      coords: rn.geometry.coordinates,
      zone: slug(floorName),
      accessibility,
    };
    if (halal !== undefined) node.halal = halal;
    if (vegetarian !== undefined) node.vegetarian = vegetarian;
    nodes.push(node);
    nodeById.set(node.id, node);
  }

  return { nodes, nodeById, perType, perFloorNodes, poiCount };
}

function buildEdgesList(
  rawNodes: RawNode[],
  floors: Map<string, MapFloor>,
  nodeCoord: Map<string, [number, number]>,
  nodeFloor: Map<string, string>,
  connections: RawConnection[]
) {
  const connByPair = new Map<string, RawConnection>();
  for (const c of connections) {
    for (let i = 0; i < c.nodes.length; i++) {
      for (let j = i + 1; j < c.nodes.length; j++) {
        connByPair.set(pairKey(c.nodes[i]!, c.nodes[j]!), c);
      }
    }
  }

  const edges: GraphEdge[] = [];
  const edgePerConnType: Record<string, number> = {};
  let edgeHorizontal = 0;
  let edgeVertical = 0;
  let edgeAccessible = 0;
  let edgeNotAccessible = 0;
  
  const floorElev = (fid: string) => floors.get(fid)?.elevation ?? 0;
  const OUTDOOR_FLOOR = [...floors.values()].find((f) => /outdoor/i.test(f.name))?.id;

  for (const rn of rawNodes) {
    const from = rn.properties.id;
    const fromCoord = nodeCoord.get(from)!;
    for (const nb of rn.properties.neighbors) {
      const to = nb.id;
      if (to === from) continue; 
      const toCoord = nodeCoord.get(to);
      if (!toCoord) continue;
      const dist = haversineM(fromCoord, toCoord);
      const sameFloor = nodeFloor.get(from) === nodeFloor.get(to);
      const outdoor =
        OUTDOOR_FLOOR !== undefined &&
        (nodeFloor.get(from) === OUTDOOR_FLOOR || nodeFloor.get(to) === OUTDOOR_FLOOR);

      let edge: GraphEdge;
      if (nb.weight === 0 && sameFloor) {
        edge = {
          from,
          to,
          distance_m: round(dist, 2),
          avg_walk_seconds: round(dist / WALK_SPEED_MPS, 1),
          indoor: !outdoor,
          step_free: true,
          wheelchair_accessible: true,
          capacity_class: 'normal',
          bidirectional: false,
        };
        edgeHorizontal++;
      } else {
        const conn = connByPair.get(pairKey(from, to));
        const floorDelta = floorElev(nodeFloor.get(to)!) - floorElev(nodeFloor.get(from)!);
        if (conn) {
          const m = connectionEdgeModel(conn.type, conn.accessible, floorDelta);
          edge = {
            from,
            to,
            distance_m: round(dist + Math.abs(floorDelta) * 4, 2),
            avg_walk_seconds: m.seconds,
            indoor: !outdoor,
            step_free: m.step_free,
            wheelchair_accessible: m.wheelchair_accessible,
            capacity_class: m.capacity_class,
            bidirectional: false,
            notes: conn.details?.name ? \`\${conn.type}: \${conn.details.name}\` : conn.type,
          };
          edgePerConnType[conn.type] = (edgePerConnType[conn.type] ?? 0) + 1;
        } else {
          edge = {
            from,
            to,
            distance_m: round(dist + Math.abs(floorDelta) * 4, 2),
            avg_walk_seconds: round(dist / WALK_SPEED_MPS + Math.abs(floorDelta) * 20, 1),
            indoor: !outdoor,
            step_free: false,
            wheelchair_accessible: false,
            capacity_class: 'normal',
            bidirectional: false,
            notes: 'unclassified level change',
          };
          edgePerConnType['unclassified'] = (edgePerConnType['unclassified'] ?? 0) + 1;
        }
        edgeVertical++;
      }
      if (edge.wheelchair_accessible) edgeAccessible++;
      else edgeNotAccessible++;
      edges.push(edge);
    }
  }

  return { edges, edgeHorizontal, edgeVertical, edgeAccessible, edgeNotAccessible, edgePerConnType };
}
`;

const replaceStr = `  const { nodeToLoc, mappedViaNodes, mappedViaSpace } = buildNodeLinks(locations, spaces, rawNodes);

  // --- Node coord + floor lookups. ---
  const nodeCoord = new Map<string, [number, number]>();
  const nodeFloor = new Map<string, string>();
  for (const rn of rawNodes) {
    nodeCoord.set(rn.properties.id, rn.geometry.coordinates);
    nodeFloor.set(rn.properties.id, rn.properties.map);
  }

  const { nodes, nodeById, perType, perFloorNodes, poiCount } = buildNodesList(rawNodes, floors, nodeToLoc, locCategory);

  let { edges, edgeHorizontal, edgeVertical, edgeAccessible, edgeNotAccessible, edgePerConnType } = buildEdgesList(rawNodes, floors, nodeCoord, nodeFloor, connections);
`;

const searchStrRegex = /const nodeExists = new Set.*?let edgeHorizontal = 0;\n  let edgeVertical = 0;\n  let edgeAccessible = 0;\n  let edgeNotAccessible = 0;/s;

// We need a more precise search string to replace the bulk of the function safely.
code = code.substring(0, code.indexOf('const nodeExists = new Set')) + replaceStr + code.substring(code.indexOf('for (const rn of rawNodes) {\n    const from = rn.properties.id;'));

code = code.substring(0, code.indexOf('for (const rn of rawNodes) {\n    const from = rn.properties.id;')) + code.substring(code.indexOf('// --- Connectivity bridging'));

code = code.replace('function build()', helpersStr + '\nfunction build()');

fs.writeFileSync(path, code);
