const fs = require('fs');

const path = 'scripts/import-mappedin.ts';
let code = fs.readFileSync(path, 'utf8');

const helpersStr = `
function getOverrideType(hay: string): Classified | null {
  if (/first[- ]?aid|\\baed\\b|medical|emergency care|nurse station/.test(hay)) {
    return { type: 'first_aid', accessibility: ['step_free', 'wheelchair'] };
  }
  if (/sensory|quiet room|calm|relaxation/.test(hay)) {
    return { type: 'sensory_safe_zone', accessibility: ['sensory_safe', 'step_free', 'wheelchair'] };
  }
  if (/prayer|chapel|worship|meditation|multi[- ]?faith/.test(hay)) {
    return { type: 'prayer_room', accessibility: ['step_free'] };
  }
  if (/rideshare|ride ?share|pick ?up|drop ?off|shuttle|\\bbus\\b|taxi|\\btrain\\b|\\brail\\b|nj transit|light rail|park.?ride/.test(hay)) {
    return { type: 'transit_link', accessibility: ['step_free', 'wheelchair'] };
  }
  if (/nursing|lactation|mother.?s room|feeding/.test(hay)) {
    return { type: 'family_room', accessibility: ['step_free', 'wheelchair', 'family'] };
  }
  return null;
}

function getFallbackType(locType: string | undefined): NodeType {
  if (locType === 'seating') return 'seating_section';
  if (locType === 'gate') return 'entry_gate';
  if (locType === 'tenant') return 'concession';
  if (locType === 'building') return 'concourse_segment';
  return 'information_kiosk';
}

function enrichType(type: NodeType, hay: string): Classified {
  const acc: GraphNode['accessibility'] = [];
  const out: Classified = { type, accessibility: acc };

  if (type === 'restroom') {
    acc.push('wheelchair', 'step_free');
    if (/family|companion|all[- ]?gender/.test(hay)) acc.push('family');
  } else if (type === 'entry_gate') {
    acc.push('step_free', 'wheelchair');
  } else if (type === 'parking_link') {
    if (/accessible|ada|handicap/.test(hay)) acc.push('wheelchair');
  } else if (type === 'seating_section') {
    acc.push('step_free');
    if (/accessible|ada|wheelchair|companion/.test(hay)) acc.push('wheelchair');
  } else if (type === 'atm' || type === 'merchandise' || type === 'information_kiosk') {
    acc.push('step_free');
  }

  if (type === 'concession') {
    acc.push('step_free');
    if (/halal/.test(hay)) out.halal = true;
    if (/vegan|vegetarian|veggie|plant[- ]?based|garden/.test(hay)) out.vegetarian = true;
  }

  return out;
}
`;

const searchStr = `  // 1. Specific overrides the 15 categories cannot express.
  if (/first[- ]?aid|\\baed\\b|medical|emergency care|nurse station/.test(hay)) {
    return { type: 'first_aid', accessibility: ['step_free', 'wheelchair'] };
  }
  if (/sensory|quiet room|calm|relaxation/.test(hay)) {
    return { type: 'sensory_safe_zone', accessibility: ['sensory_safe', 'step_free', 'wheelchair'] };
  }
  if (/prayer|chapel|worship|meditation|multi[- ]?faith/.test(hay)) {
    return { type: 'prayer_room', accessibility: ['step_free'] };
  }
  if (/rideshare|ride ?share|pick ?up|drop ?off|shuttle|\\bbus\\b|taxi|\\btrain\\b|\\brail\\b|nj transit|light rail|park.?ride/.test(hay)) {
    return { type: 'transit_link', accessibility: ['step_free', 'wheelchair'] };
  }
  if (/nursing|lactation|mother.?s room|feeding/.test(hay)) {
    return { type: 'family_room', accessibility: ['step_free', 'wheelchair', 'family'] };
  }

  // 2. Category-driven classification (authoritative for the rest).
  let type: NodeType | undefined = category ? CATEGORY_TO_TYPE[category] : undefined;

  // 3. Fall back to Mappedin location.type when no category.
  if (!type) {
    if (loc.type === 'seating') type = 'seating_section';
    else if (loc.type === 'gate') type = 'entry_gate';
    else if (loc.type === 'tenant') type = 'concession';
    else if (loc.type === 'building') type = 'concourse_segment';
    else type = 'information_kiosk';
  }

  // 4. Enrich by type.
  const acc: GraphNode['accessibility'] = [];
  const out: Classified = { type, accessibility: acc };

  if (type === 'restroom') {
    acc.push('wheelchair', 'step_free');
    if (/family|companion|all[- ]?gender/.test(hay)) acc.push('family');
  } else if (type === 'entry_gate') {
    acc.push('step_free', 'wheelchair');
  } else if (type === 'parking_link') {
    if (/accessible|ada|handicap/.test(hay)) acc.push('wheelchair');
  } else if (type === 'seating_section') {
    acc.push('step_free');
    if (/accessible|ada|wheelchair|companion/.test(hay)) acc.push('wheelchair');
  } else if (type === 'atm' || type === 'merchandise' || type === 'information_kiosk') {
    acc.push('step_free');
  }

  if (type === 'concession') {
    acc.push('step_free');
    if (/halal/.test(hay)) out.halal = true;
    if (/vegan|vegetarian|veggie|plant[- ]?based|garden/.test(hay)) out.vegetarian = true;
  }

  return out;`;

const replaceStr = `  const override = getOverrideType(hay);
  if (override) return override;

  const type = (category ? CATEGORY_TO_TYPE[category] : undefined) || getFallbackType(loc.type);

  return enrichType(type, hay);`;

code = code.replace(searchStr, replaceStr);
code = code.replace('function classifyLocation', helpersStr + '\nfunction classifyLocation');

fs.writeFileSync(path, code);
