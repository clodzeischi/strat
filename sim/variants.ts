import { HARD_PROFILE, type AIProfile } from '../src/game/ai';

/** Candidate Hard economy profiles. Anything not set falls back to Normal. */
export const VARIANTS: Record<string, Partial<AIProfile>> = {
  normal: {},
  hard: HARD_PROFILE,
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
  // Hard behavior on top of the h6-always economy (the best economy on random maps). HARD_PROFILE is hard-raid12.
  'hard-econ': { harvesters: 6, extraRefinery: 'always', saveForOpening: true },
  'hard-raid': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, raids: { trikes: 3, start: 150, interval: 60, hunt: true } },
  'hard-init': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, initiative: 1.5, waveRetreat: 0.5 },
  'hard-init-raid': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, initiative: 1.5, waveRetreat: 0.5, raids: { trikes: 3, start: 150, interval: 60, hunt: true } },
  'hard-init-1.2': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, initiative: 1.2, waveRetreat: 0.5 },
  'hard-init-2': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, initiative: 2, waveRetreat: 0.5 },
  'hard-noraid': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, initiative: 1.2, waveRetreat: 0.5 },
  'hard-raid12': { harvesters: 6, extraRefinery: 'always', saveForOpening: true, raids: { trikes: 3, start: 150, interval: 60, hunt: true }, initiative: 1.2, waveRetreat: 0.5 },
};
