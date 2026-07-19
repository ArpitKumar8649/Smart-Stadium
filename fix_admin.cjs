const fs = require('fs');
const path = 'backend/src/routes/admin.ts';
let code = fs.readFileSync(path, 'utf8');

const searchStr = `      occupancy_pct,
      headline: concerns.length > 0
        ? \`\${concerns.length} high-density zone\${concerns.length === 1 ? '' : 's'} require attention.\`
        : \`Operations stable during \${sim.phase().replace('_', ' ')}.\`,
      summary:`;

const replaceStr = `      occupancy_pct,
      headline: concerns.length > 0
        ? \`\${concerns.length} high-density zone\${concerns.length === 1 ? '' : 's'} require attention.\`
        : \`Operations stable during \${sim.phase().replace('_', ' ')}.\`,
      summary:`;

// Actually let's just make a variable `zoneSuffix` before the return statement.
const searchBlock = `    const now = new Date();
    return BriefingSchema.parse({
      id: \`brf_\${randomUUID().slice(0, 8)}\`,
      venue_id,
      generated_at: now.toISOString(),
      window_start: now.toISOString(),
      window_end: new Date(now.getTime() + 300_000).toISOString(),
      occupancy_pct,
      headline: concerns.length > 0
        ? \`\${concerns.length} high-density zone\${concerns.length === 1 ? '' : 's'} require attention.\`
        : \`Operations stable during \${sim.phase().replace('_', ' ')}.\`,`;

const replaceBlock = `    const now = new Date();
    const zoneSuffix = concerns.length === 1 ? '' : 's';
    const headlineText = concerns.length > 0
        ? \`\${concerns.length} high-density zone\${zoneSuffix} require attention.\`
        : \`Operations stable during \${sim.phase().replace('_', ' ')}.\`;
        
    return BriefingSchema.parse({
      id: \`brf_\${randomUUID().slice(0, 8)}\`,
      venue_id,
      generated_at: now.toISOString(),
      window_start: now.toISOString(),
      window_end: new Date(now.getTime() + 300_000).toISOString(),
      occupancy_pct,
      headline: headlineText,`;

code = code.replace(searchBlock, replaceBlock);
fs.writeFileSync(path, code);
