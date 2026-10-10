// Audio: the announcer's lines (one voice for every faction), the units' acknowledgements (one set per faction), and
// the sound effects.

/** The announcer's lines: each one is public/audio/announcer/<name>.mp3. */
export const ANNOUNCEMENTS = [
  'our_base_under_attack', 'our_forces_are_under_attack', 'harvester_under_attack', 'spice_crew_under_attack',
  'spice_camp_under_attack', 'enemy_airdrop_detected', 'enemy_unit_about_to_selfdestruct',
  'thumper_planted', 'thumper_detected_sandworm_is_coming', 'our_thumper_destroyed', 'shaihulud_has_come', 'worm_sign',
  'the_worm_you_called_is_still_about', 'thumper_needs_open_level_sand',
  'construction_complete', 'unit_ready', 'upgrade_complete', 'insufficient_funds', 'production_queue_full',
  'already_building', 'already_researching', 'cannot_build_there', 'lockon_needs_visible_target',
  'a_spice_camp_has_run_dry', 'spice_camp_dry_crew_moving', 'no_room_for_spice_camp', 'no_idle_gatherers',
] as const;
export type Announcement = (typeof ANNOUNCEMENTS)[number];

/** What a unit acknowledges: being selected, a move order, an attack order. */
export type AckKind = 'select' | 'move' | 'attack';
/** Lines per kind of acknowledgement: public/audio/<faction>/<kind>_<1..ACK_LINES>.mp3. */
export const ACK_LINES = 4;

/**
 * Sound effects: each one is public/audio/effects/<name>.mp3. Weapons name the sound of their shot (`WeaponDef.sound`);
 * explosions, the button click and the victory sting are played by name.
 */
export const SOUNDS = [
  'light_mg', 'heavy_mg', 'coax_mg', 'devastator_coax', 'single_shot', 'small_laser', 'heavy_laser', 'auto_laser',
  'sky_raider_fire', 'launch_small', 'launch_large', 'explosion_small', 'explosion_med', 'explosion_Large', 'click', 'win',
] as const;
export type Sound = (typeof SOUNDS)[number];
