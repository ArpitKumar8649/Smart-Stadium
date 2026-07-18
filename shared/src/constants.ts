export const VENUE_ID = 'metlife' as const;

export const SUPPORTED_LOCALES = [
  'en',
  'es',
  'pt',
  'fr',
  'ar',
  'de',
  'ja',
  'ko',
  'hi',
  'bn',
  'ta',
  'zh-Hans',
] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ['ar'] as const;

export const ROUTING_MODES = ['fastest', 'step_free', 'sensory_safe', 'low_crowd'] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export const NODE_TYPES = [
  'entry_gate',
  'security_check',
  'concourse_segment',
  'seating_section',
  'restroom',
  'concession',
  'first_aid',
  'elevator',
  'escalator',
  'ramp',
  'exit',
  'parking_link',
  'transit_link',
  'family_room',
  'sensory_safe_zone',
  'information_kiosk',
  'merchandise',
  'atm',
  'prayer_room',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const ALERT_KINDS = [
  'gate_change',
  'kickoff_reminder',
  'halftime_surge',
  'weather',
  'facility_closure',
  'transit_advice',
  'general',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const INCIDENT_SEVERITY = ['info', 'warn', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY)[number];

export const HEARTBEAT_MS = 20_000;
export const CROWD_SIM_TICK_MS = 15_000;
