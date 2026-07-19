# Concourse Architecture

This document describes the high-level architecture of Concourse, focusing on the multi-agent system and the separation of deterministic logic from LLM generation.

## Multi-Agent System

Concourse uses a multi-agent architecture to split concerns and keep prompts focused.

1.  **Concierge Agent**: The primary fan-facing agent. It handles general Q&A, indoor navigation, and finding nearest facilities.
    *   **Prompt**: `data/prompts/concierge.system.md`
    *   **Implementation**: `backend/src/services/agent/concierge.ts`
    *   **Tools**: `find_route`, `find_nearest`, `get_venue_info`, `list_facilities`, `resolve_place`, `get_crowd`, `transit_handoff`

2.  **Transit Agent**: A specialist agent invoked by the concierge (via `transit_handoff`) to plan multi-modal ground travel to the stadium.
    *   **Prompt**: `data/prompts/transit.system.md`
    *   **Implementation**: `backend/src/services/agent/transit.ts`
    *   **Tools**: `plan_ground_routes`, `estimate_carbon_footprint`, `recommend_best_mode`

## Deterministic Tools

Both agents are heavily bounded by deterministic tools. The LLMs are instructed **never to invent facts**.

*   **Venue Graph**: A static graph of MetLife Stadium (`data/venues/metlife/graph.json`) provides the ground truth for all indoor routing. The LLM never sees the graph itself; it only calls tools that query it.
*   **Crowd Simulator**: A tick-based simulator (`backend/src/services/crowd/simulator.ts`) generates realistic match-phase crowd density and wait times. This feeds into the `get_crowd` tool and influences the `low_crowd` routing mode.
*   **Google Routes**: The `plan_ground_routes` tool uses the Google Routes API to generate real-world travel options.
*   **Carbon Estimation**: The `estimate_carbon_footprint` tool uses a bundled DEFRA 2023 emissions-factor table (`backend/src/services/transit/carbon.ts`) to provide honest CO₂ estimates for travel options.

## Core Flows

### 1. Fan Navigation
1. Fan asks for directions.
2. Concierge calls `find_route` or `find_nearest`.
3. Tool resolves labels to nodes and runs A* over the venue graph.
4. Tool returns a compact `RouteResponse`.
5. Concierge narrates the route.

### 2. Fan Transportation (Transit Handoff)
1. Fan asks how to get to the stadium.
2. Concierge calls `transit_handoff` with the fan's priority (time, carbon, balanced).
3. The Transit Agent runs its deterministic loop:
    *   `plan_ground_routes` (Google Routes)
    *   `estimate_carbon_footprint` (DEFRA table)
    *   `recommend_best_mode` (Pareto-aware scorer)
4. Transit Agent returns a structured `TransitResponse`.
5. Concierge narrates the recommendation.
6. Frontend renders the `TransitPlanCard` with all options.

### 3. Tournament Operations Console (`/admin`)
*   **Briefing**: Generates a structured AI briefing (headline, concerns, recommendations) from the live crowd and incident state.
*   **Incident Injection**: Allows staff to inject a simulated incident (e.g., a gate closure). This publishes an event to the SSE stream.
*   **Real-time Advisories**: Connected fan clients receive the SSE event, exclude the affected node from the graph, and automatically re-plan their active route.
