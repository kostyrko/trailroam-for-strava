import type { ActivityCategory } from '../storage/storage.models';

const SPORT_TYPE_CATEGORY_MAP: Record<string, ActivityCategory> = {
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
  Hike: 'walk',
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
};

export function formatSportType(sportType: string): string {
  const special = SPECIAL_SPORT_TYPE_NAMES[sportType];
  if (special) { return special; }
  return sportType.replace(/([A-Z])/g, ' $1').trim();
}
