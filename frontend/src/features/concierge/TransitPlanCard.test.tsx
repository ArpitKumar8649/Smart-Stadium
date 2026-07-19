import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TransitPlanCard } from './TransitPlanCard';
import type { TransitResponse } from '@concourse/shared';

const MOCK_PLAN = {
  priority: 'time',
  options: [
    { mode: 'TRANSIT', label: 'NJ Transit Bus 160', duration_seconds: 2400, distance_meters: 15200, co2_grams: 500, polyline: '', emission_factor_g_per_km: 0, carbon_source: 'emissions_factor_table' },
    { mode: 'DRIVE', label: 'Via NJ-3 W', duration_seconds: 1500, distance_meters: 16500, co2_grams: 2800, polyline: '', emission_factor_g_per_km: 0, carbon_source: 'emissions_factor_table' },
    { mode: 'WALK', label: 'Walking', duration_seconds: 14400, distance_meters: 14000, co2_grams: 0, polyline: '', emission_factor_g_per_km: 0, carbon_source: 'emissions_factor_table' },
    { mode: 'BICYCLE', label: 'Cycling', duration_seconds: 3600, distance_meters: 14000, co2_grams: 0, polyline: '', emission_factor_g_per_km: 0, carbon_source: 'emissions_factor_table' },
  ],
  recommendation: {
    recommended_mode: 'TRANSIT',
    fastest_mode: 'DRIVE',
    greenest_mode: 'WALK',
    reason: 'Take the bus.',
    co2_saved_vs_drive_grams: 2300,
    time_cost_vs_fastest_seconds: 900,
  }
};

describe('TransitPlanCard', () => {
  it('renders all options sorted with the recommendation first', () => {
    render(<TransitPlanCard plan={MOCK_PLAN as unknown as TransitResponse} />);

    // Recommended mode
    expect(screen.getByText('🚆 Take the bus.')).toBeInTheDocument();

    // Check formatting functions implicitly through output
    expect(screen.getByText('40 min')).toBeInTheDocument();
    expect(screen.getByText('15 km')).toBeInTheDocument();
    expect(screen.getByText('500 g CO₂')).toBeInTheDocument();

    // Check fastest formatting
    expect(screen.getByText('25 min')).toBeInTheDocument();
    expect(screen.getByText('17 km')).toBeInTheDocument();
    expect(screen.getByText('2.8 kg CO₂')).toBeInTheDocument();

    // Check 0g CO₂ edge case and hour/minute formatting
    expect(screen.getByText('4 h')).toBeInTheDocument();
    expect(screen.getAllByText('14 km').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0 g CO₂').length).toBeGreaterThan(0);

    // Check labels
    expect(screen.getByText('Fastest')).toBeInTheDocument();
    expect(screen.getByText('Greenest')).toBeInTheDocument();

    // Check footprint message
    expect(screen.getByText(/Saves about 2\.3 kg CO₂ vs\. driving\./)).toBeInTheDocument();
  });

  it('renders negative carbon savings correctly', () => {
    const plan = {
      ...MOCK_PLAN,
      recommendation: {
        ...MOCK_PLAN.recommendation,
        co2_saved_vs_drive_grams: -1500,
      }
    };
    render(<TransitPlanCard plan={plan as unknown as TransitResponse} />);
    expect(screen.getByText(/Emits about 1\.5 kg CO₂ more than driving\./)).toBeInTheDocument();
  });

  it('renders zero carbon savings correctly', () => {
    const plan = {
      ...MOCK_PLAN,
      recommendation: {
        ...MOCK_PLAN.recommendation,
        co2_saved_vs_drive_grams: 0,
      }
    };
    render(<TransitPlanCard plan={plan as unknown as TransitResponse} />);
    expect(screen.getByText(/Same footprint as driving\./)).toBeInTheDocument();
  });

  it('formats large duration properly (hours and minutes)', () => {
    const plan = {
      ...MOCK_PLAN,
      options: [
        { mode: 'WALK', label: 'Walking', duration_seconds: 5400, distance_meters: 1000, co2_grams: 0, polyline: '', emission_factor_g_per_km: 0, carbon_source: 'emissions_factor_table' },
      ]
    };
    render(<TransitPlanCard plan={plan as unknown as TransitResponse} />);
    expect(screen.getByText('1 h 30 min')).toBeInTheDocument();
  });

  it('formats tiny distance properly (meters)', () => {
    const plan = {
      ...MOCK_PLAN,
      options: [
        { mode: 'WALK', label: 'Walking', duration_seconds: 300, distance_meters: 800, co2_grams: 0, polyline: '', emission_factor_g_per_km: 0, carbon_source: 'emissions_factor_table' },
      ]
    };
    render(<TransitPlanCard plan={plan as unknown as TransitResponse} />);
    expect(screen.getByText('800 m')).toBeInTheDocument();
  });
});