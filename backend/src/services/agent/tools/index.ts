import { ROUTING_MODES } from '@concourse/shared';
import { FACILITY_TYPES } from './formatters.js';
import type { ToolDefinition } from '../../llm/provider.js';
import { handleFindRoute } from './handlers/route.js';
import { handleFindNearest } from './handlers/nearest.js';
import { handleGetVenueInfo } from './handlers/venue.js';
import { handleListFacilities } from './handlers/facilities.js';
import { handleResolvePlace } from './handlers/resolve.js';
import { handleGetCrowd } from './handlers/crowd.js';
import { handleTransitHandoff } from './handlers/transit.js';

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  summary: string;
}


export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'find_route',
    description:
      'Route between two named places in the stadium (e.g. "Section 144" to "Women\'s Restroom"). ' +
      'Returns turn-by-turn walking directions with total time and distance. ' +
      'Use mode to honor accessibility or comfort needs.',
    parameters: {
      type: 'object',
      properties: {
        from_label: {
          type: 'string',
          description: 'Starting place as the guest names it, e.g. "Section 144" or "Gate A".',
        },
        to_label: {
          type: 'string',
          description: 'Destination place, e.g. "nearest restroom label" or "Prayer Room".',
        },
        mode: {
          type: 'string',
          enum: [...ROUTING_MODES],
          description:
            'Routing preference. fastest = shortest time; step_free = avoid stairs/escalators ' +
            '(wheelchair/stroller); sensory_safe = gentler, quieter path; low_crowd = avoid congestion.',
        },
      },
      required: ['from_label', 'to_label'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_nearest',
    description:
      'Find the nearest facility of a given type to a starting place, and return a walking route to it. ' +
      'Use for "where is the closest restroom / ATM / first aid" style questions.',
    parameters: {
      type: 'object',
      properties: {
        from_label: {
          type: 'string',
          description: 'The guest\'s current location, e.g. "Section 210".',
        },
        facility_type: {
          type: 'string',
          enum: [...FACILITY_TYPES],
          description: 'Kind of facility to locate.',
        },
        step_free: {
          type: 'boolean',
          description:
            'If true, prefer a step-free facility and route (wheelchair/stroller friendly). Default false.',
        },
        dietary: {
          type: 'string',
          enum: ['halal', 'vegetarian'],
          description:
            'Only for facility_type "concession": restrict to halal or vegetarian food outlets. ' +
            'Set this whenever the guest asks for halal or vegetarian/vegan food.',
        },
      },
      required: ['from_label', 'facility_type'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_venue_info',
    description:
      'Static orientation facts about MetLife Stadium: the list of levels/floors, the entry gates, ' +
      'and what facilities exist on each level. Use for "how is the stadium laid out" questions.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['floors', 'gates', 'levels', 'overview'],
          description:
            'Which slice of orientation info to return. Omit or use "overview" for everything.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_facilities',
    description:
      'List named facilities of a type, optionally restricted to one level. ' +
      'Use for "what food options are on level 1" or "list the ATMs".',
    parameters: {
      type: 'object',
      properties: {
        facility_type: {
          type: 'string',
          enum: [...FACILITY_TYPES],
          description: 'Kind of facility to list.',
        },
        level: {
          type: 'integer',
          minimum: 0,
          maximum: 7,
          description: 'Optional concourse level (0–7) to filter to.',
        },
      },
      required: ['facility_type'],
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_place',
    description:
      'Disambiguate a vague or partial place name into a ranked list of real candidate labels. ' +
      'Call this first when the guest is unclear about where they mean, then confirm before routing.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The fuzzy place name to resolve, e.g. "the taco place near me" or "144".',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_crowd',
    description:
      'Current crowd density and queue wait for a place or zone, with a short-term projection ' +
      '(T+15 / T+30 min). Call this for "is it busy", "how long is the line", "should I go now" ' +
      'questions, or before recommending a facility during the halftime rush. Crowd data is ' +
      'simulated for this preview — say so if asked. Omit `place` to get the busiest zones overall.',
    parameters: {
      type: 'object',
      properties: {
        place: {
          type: 'string',
          description:
            'A place or area the guest names, e.g. "Section 144", "Level 1 restrooms", "food court". ' +
            'Omit to summarise the most crowded zones in the venue right now.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'transit_handoff',
    description:
      "Hand a fan's transportation question off to Concourse's specialist Transit Agent. " +
      'Call this whenever a fan asks how to get to MetLife Stadium from outside — e.g. from their ' +
      'hotel, home, an airport, or another city. The Transit Agent plans every ground-travel mode ' +
      '(drive, transit, two-wheeler, cycle, walk), attaches per-mode CO₂ estimates from a bundled ' +
      'emissions-factor table, and returns a single recommendation ranked on the fan\'s stated ' +
      'priority (time, carbon, or balanced). Never plan an outdoor trip yourself; delegate.',
    parameters: {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          enum: ['time', 'carbon', 'balanced'],
          description:
            "The fan's stated priority. Use 'time' if they asked for the fastest option, " +
            "'carbon' if they asked for the greenest or lowest-emissions option, and 'balanced' " +
            '(default) otherwise. This will be the same value the Transit Agent uses to score options.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export async function handleToolCall(name: string, args: unknown, context?: { location?: { lat: number, lng: number } }): Promise<ToolResult> {
  try {
    switch (name) {
      case 'find_route':
        return handleFindRoute(args);
      case 'transit_handoff':
        return await handleTransitHandoff(args, context);
      case 'find_nearest':
        return handleFindNearest(args);
      case 'get_venue_info':
        return handleGetVenueInfo(args);
      case 'list_facilities':
        return handleListFacilities(args);
      case 'resolve_place':
        return handleResolvePlace(args);
      case 'get_crowd':
        return handleGetCrowd(args);
      default:
        return { ok: false, error: `Unknown tool: ${name}`, summary: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, summary: `Tool "${name}" failed` };
  }
}
