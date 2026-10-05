import type { AIProfile } from '../src/ai';

/** Candidate Hard economy profiles. Anything not set falls back to Normal. */
export const VARIANTS: Record<string, Partial<AIProfile>> = {
  normal: {},
  // Normal's mass-infantry accident from the first run, kept as a reference point.
  'h4-nosave': { harvesters: 4, extraRefinery: 'threat' },
  'h3-threat': { harvesters: 3, extraRefinery: 'threat', saveForOpening: true },
  'h4-threat': { harvesters: 4, extraRefinery: 'threat', saveForOpening: true },
  'h5-threat': { harvesters: 5, extraRefinery: 'threat', saveForOpening: true },
  'h6-threat': { harvesters: 6, extraRefinery: 'threat', saveForOpening: true },
  'h8-threat': { harvesters: 8, extraRefinery: 'threat', saveForOpening: true },
  'h4-always': { harvesters: 4, extraRefinery: 'always', saveForOpening: true },
  'h6-always': { harvesters: 6, extraRefinery: 'always', saveForOpening: true },
  'h5-rax-first': { harvesters: 5, extraRefinery: 'threat', saveForOpening: true, opening: ['barracks', 'refinery', 'factory'] },
  'h6-never': { harvesters: 6, extraRefinery: 'never', saveForOpening: true },
  'h8-never': { harvesters: 8, extraRefinery: 'never', saveForOpening: true },
  'h8-always': { harvesters: 8, extraRefinery: 'always', saveForOpening: true },
  'h10-threat': { harvesters: 10, extraRefinery: 'threat', saveForOpening: true },
  'h10-always': { harvesters: 10, extraRefinery: 'always', saveForOpening: true },
  'h12-always': { harvesters: 12, extraRefinery: 'always', saveForOpening: true },
  'h14-always': { harvesters: 14, extraRefinery: 'always', saveForOpening: true },
  // Second factory instead of a second refinery: parallel harvester production without the refinery premium.
  'h8-2fac': { harvesters: 8, extraRefinery: 'never', saveForOpening: true, opening: ['refinery', 'barracks', 'factory', 'factory'] },
  'h10-2fac': { harvesters: 10, extraRefinery: 'never', saveForOpening: true, opening: ['refinery', 'barracks', 'factory', 'factory'] },
  'h12-2fac': { harvesters: 12, extraRefinery: 'never', saveForOpening: true, opening: ['refinery', 'barracks', 'factory', 'factory'] },
  'h10-2fac-threat': { harvesters: 10, extraRefinery: 'threat', saveForOpening: true, opening: ['refinery', 'barracks', 'factory', 'factory'] },
};
