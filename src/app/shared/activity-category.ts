import type { ActivityCategory } from '../storage/storage.models';

const SPORT_TYPE_CATEGORY_MAP: Record<string, ActivityCategory> = {
  // --- Strava types ---
  Ride: 'ride',
  GravelRide: 'ride',
  MountainBikeRide: 'ride',
  EBikeRide: 'ride',
  EMountainBikeRide: 'ride',
  VirtualRide: 'ride',
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  Walk: 'walk',
  Hike: 'hike',
  Swim: 'water',
  Surfing: 'water',
  Windsurfing: 'water',
  Windsurf: 'water',
  Kitesurf: 'water',
  Kayaking: 'paddling',
  Canoeing: 'paddling',
  StandUpPaddling: 'paddling',
  Rowing: 'paddling',
  VirtualRow: 'paddling',
  AlpineSki: 'winter',
  BackcountrySki: 'winter',
  NordicSki: 'winter',
  RollerSki: 'winter',
  Ski: 'winter',
  Snowboard: 'winter',
  Snowshoe: 'winter',
  IceSkate: 'winter',
  Workout: 'other',
  Yoga: 'other',
  Pilates: 'other',
  Crossfit: 'other',
  Elliptical: 'other',
  StairStepper: 'other',
  WeightTraining: 'other',
  RockClimbing: 'other',
  Golf: 'other',
  Handcycle: 'other',
  Wheelchair: 'other',
  Velomobile: 'other',
  Skateboard: 'other',
  InlineSkate: 'other',
  Sail: 'other',
  Soccer: 'other',
  Basketball: 'other',
  Tennis: 'other',
  TableTennis: 'other',
  Badminton: 'other',
  Pickleball: 'other',
  Racquetball: 'other',
  Squash: 'other',
  Other: 'other',

  // --- Komoot types ---
  racebike: 'ride',
  e_racebike: 'ride',
  mtb: 'ride',
  e_mtb: 'ride',
  mtb_easy: 'ride',
  e_mtb_easy: 'ride',
  touringbicycle: 'ride',
  e_touringbicycle: 'ride',
  citybike: 'ride',
  cycling: 'ride',
  mountainbiking: 'ride',
  running: 'run',
  trail_running: 'run',
  hiking: 'hike',
  touring: 'hike',
  race_walking: 'walk',
  nordic_walking: 'walk',
  swimming: 'water',
  surfing: 'water',
  kite_surfing: 'water',
  wind_surfing: 'water',
  wakeboarding: 'water',
  sailing: 'water',
  diving: 'water',
  kayaking: 'paddling',
  canoeing: 'paddling',
  rafting: 'paddling',
  rowing: 'paddling',
  roller_skiing: 'winter',
  winter: 'winter_sport',
  mountaineering: 'mountaineering',
  climbing: 'other',
  bouldering: 'other',
  skating: 'other',
  longboarding: 'other',
  skateboarding: 'other',
  handbike: 'other',
};

const PREFIX_MAP: [string, ActivityCategory][] = [
  ['Ski', 'winter'],
];

const DEFAULT_CATEGORY: ActivityCategory = 'other';

export function mapSportTypeToCategory(sportType: string): ActivityCategory {
  const exact = SPORT_TYPE_CATEGORY_MAP[sportType];
  if (exact) { return exact; }
  for (const [prefix, category] of PREFIX_MAP) {
    if (sportType.startsWith(prefix)) { return category; }
  }
  return DEFAULT_CATEGORY;
}

const SPECIAL_SPORT_TYPE_NAMES: Record<string, string> = {
  // --- Strava display names ---
  GravelRide: 'Gravel',
  MountainBikeRide: 'Mountain Bike',
  EBikeRide: 'E-Bike',
  EMountainBikeRide: 'E-Mountain Bike',
  VirtualRide: 'Virtual Ride',
  TrailRun: 'Trail Run',
  VirtualRun: 'Virtual Run',
  StandUpPaddling: 'Stand Up Paddling',
  VirtualRow: 'Virtual Row',
  BackcountrySki: 'Backcountry Ski',
  NordicSki: 'Nordic Ski',
  RollerSki: 'Roller Ski',
  AlpineSki: 'Alpine Ski',
  InlineSkate: 'Inline Skate',
  RockClimbing: 'Rock Climbing',
  StairStepper: 'Stair Stepper',
  WeightTraining: 'Weight Training',
  TableTennis: 'Table Tennis',

  // --- Komoot display names ---
  racebike: 'Road Cycling',
  e_racebike: 'E-Road Cycling',
  mtb: 'Mountain Biking',
  e_mtb: 'E-Mountain Biking',
  mtb_easy: 'Gravel',
  e_mtb_easy: 'E-Gravel',
  touringbicycle: 'Bike Touring',
  e_touringbicycle: 'E-Bike Touring',
  citybike: 'City Biking',
  mountainbiking: 'Mountain Biking',
  running: 'Running',
  trail_running: 'Trail Running',
  hiking: 'Hiking',
  touring: 'Touring',
  race_walking: 'Race Walking',
  nordic_walking: 'Nordic Walking',
  swimming: 'Swimming',
  kite_surfing: 'Kite Surfing',
  wind_surfing: 'Wind Surfing',
  wakeboarding: 'Wakeboarding',
  rafting: 'Rafting',
  roller_skiing: 'Roller Skiing',
  mountaineering: 'Mountaineering',
  climbing: 'Climbing',
  bouldering: 'Bouldering',
  longboarding: 'Longboarding',
  skateboarding: 'Skateboarding',
  handbike: 'Handbike',
};

export function formatSportType(sportType: string): string {
  const special = SPECIAL_SPORT_TYPE_NAMES[sportType];
  if (special) { return special; }
  if (sportType.includes('_')) {
    return sportType
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return sportType.replace(/([A-Z])/g, ' $1').trim();
}

export function formatCategory(cat: string): string {
  return cat.toUpperCase();
}
