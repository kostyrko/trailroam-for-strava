const SPORT_TYPE_EMOJI: Record<string, string> = {
  Ride: '\u{1F6B4}', GravelRide: '\u{1F6B4}', MountainBikeRide: '\u{1F6B5}', EBikeRide: '\u{1F6B4}', EMountainBikeRide: '\u{1F6B5}', VirtualRide: '\u{1F6B4}',
  Run: '\u{1F3C3}', TrailRun: '\u{1F3C3}', VirtualRun: '\u{1F3C3}',
  Walk: '\u{1F6B6}', Hike: '\u{1F97E}',
  Swim: '\u{1F3CA}',
  Kayaking: '\u{1F6F6}', Canoeing: '\u{1F6F6}', StandUpPaddling: '\u{1F6F6}', Rowing: '\u{1F6F6}',
  AlpineSki: '\u26F7\uFE0F', BackcountrySki: '\u26F7\uFE0F', NordicSki: '\u26F7\uFE0F', Snowboard: '\u{1F3C2}', Snowshoe: '\u{1F97E}',
  RockClimbing: '\u{1F9D7}', Golf: '\u{1F3CC}\uFE0F',
  Other: '\u{1F3CB}\uFE0F', Workout: '\u{1F3CB}\uFE0F',
};

export function sportTypeEmojiFromString(sportType: string): string {
  return SPORT_TYPE_EMOJI[sportType] ?? SPORT_TYPE_EMOJI['Other'] ?? '\u{1F3CB}\uFE0F';
}

export function sportTypeEmoji(activity: { sportType: string; activityCategory?: string }): string {
  return sportTypeEmojiFromString(activity.sportType);
}

export { SPORT_TYPE_EMOJI };
