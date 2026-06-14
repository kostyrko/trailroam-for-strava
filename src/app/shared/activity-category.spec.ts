import { formatSportType, mapSportTypeToCategory } from './activity-category';

describe('mapSportTypeToCategory', () => {
  it('should map Ride to ride', () => {
    expect(mapSportTypeToCategory('Ride')).toBe('ride');
  });

  it('should map MountainBikeRide to ride', () => {
    expect(mapSportTypeToCategory('MountainBikeRide')).toBe('ride');
  });

  it('should map GravelRide to ride', () => {
    expect(mapSportTypeToCategory('GravelRide')).toBe('ride');
  });

  it('should map EBikeRide to ride', () => {
    expect(mapSportTypeToCategory('EBikeRide')).toBe('ride');
  });

  it('should map EMountainBikeRide to ride', () => {
    expect(mapSportTypeToCategory('EMountainBikeRide')).toBe('ride');
  });

  it('should map VirtualRide to ride', () => {
    expect(mapSportTypeToCategory('VirtualRide')).toBe('ride');
  });

  it('should map Walk to walk', () => {
    expect(mapSportTypeToCategory('Walk')).toBe('walk');
  });

  it('should map Hike to walk', () => {
    expect(mapSportTypeToCategory('Hike')).toBe('walk');
  });

  it('should map Run to run', () => {
    expect(mapSportTypeToCategory('Run')).toBe('run');
  });

  it('should map TrailRun to run', () => {
    expect(mapSportTypeToCategory('TrailRun')).toBe('run');
  });

  it('should map VirtualRun to run', () => {
    expect(mapSportTypeToCategory('VirtualRun')).toBe('run');
  });

  it('should map Kayaking to paddling', () => {
    expect(mapSportTypeToCategory('Kayaking')).toBe('paddling');
  });

  it('should map StandUpPaddling to paddling', () => {
    expect(mapSportTypeToCategory('StandUpPaddling')).toBe('paddling');
  });

  it('should map Canoeing to paddling', () => {
    expect(mapSportTypeToCategory('Canoeing')).toBe('paddling');
  });

  it('should map Rowing to paddling', () => {
    expect(mapSportTypeToCategory('Rowing')).toBe('paddling');
  });

  it('should map Swim to water', () => {
    expect(mapSportTypeToCategory('Swim')).toBe('water');
  });

  it('should map Surfing to water', () => {
    expect(mapSportTypeToCategory('Surfing')).toBe('water');
  });

  it('should map Windsurfing to water', () => {
    expect(mapSportTypeToCategory('Windsurfing')).toBe('water');
  });

  it('should map Windsurf to water', () => {
    expect(mapSportTypeToCategory('Windsurf')).toBe('water');
  });

  it('should map Kitesurf to water', () => {
    expect(mapSportTypeToCategory('Kitesurf')).toBe('water');
  });

  it('should map Ski to winter', () => {
    expect(mapSportTypeToCategory('Ski')).toBe('winter');
  });

  it('should map AlpineSki to winter', () => {
    expect(mapSportTypeToCategory('AlpineSki')).toBe('winter');
  });

  it('should map BackcountrySki to winter', () => {
    expect(mapSportTypeToCategory('BackcountrySki')).toBe('winter');
  });

  it('should map NordicSki to winter', () => {
    expect(mapSportTypeToCategory('NordicSki')).toBe('winter');
  });

  it('should map RollerSki to winter', () => {
    expect(mapSportTypeToCategory('RollerSki')).toBe('winter');
  });

  it('should map Snowboard to winter', () => {
    expect(mapSportTypeToCategory('Snowboard')).toBe('winter');
  });

  it('should map Snowshoe to winter', () => {
    expect(mapSportTypeToCategory('Snowshoe')).toBe('winter');
  });

  it('should map IceSkate to winter', () => {
    expect(mapSportTypeToCategory('IceSkate')).toBe('winter');
  });

  it('should map InlineSkate to other', () => {
    expect(mapSportTypeToCategory('InlineSkate')).toBe('other');
  });

  it('should map RockClimbing to other', () => {
    expect(mapSportTypeToCategory('RockClimbing')).toBe('other');
  });

  it('should map Golf to other', () => {
    expect(mapSportTypeToCategory('Golf')).toBe('other');
  });

  it('should map Handcycle to other', () => {
    expect(mapSportTypeToCategory('Handcycle')).toBe('other');
  });

  it('should map Wheelchair to other', () => {
    expect(mapSportTypeToCategory('Wheelchair')).toBe('other');
  });

  it('should map Velomobile to other', () => {
    expect(mapSportTypeToCategory('Velomobile')).toBe('other');
  });

  it('should map Skateboard to other', () => {
    expect(mapSportTypeToCategory('Skateboard')).toBe('other');
  });

  it('should map Sail to other', () => {
    expect(mapSportTypeToCategory('Sail')).toBe('other');
  });

  it('should map Workout to other', () => {
    expect(mapSportTypeToCategory('Workout')).toBe('other');
  });

  it('should map Yoga to other', () => {
    expect(mapSportTypeToCategory('Yoga')).toBe('other');
  });

  it('should map VirtualRow to paddling', () => {
    expect(mapSportTypeToCategory('VirtualRow')).toBe('paddling');
  });

  it('should map TableTennis to other', () => {
    expect(mapSportTypeToCategory('TableTennis')).toBe('other');
  });

  it('should map Racquetball to other', () => {
    expect(mapSportTypeToCategory('Racquetball')).toBe('other');
  });

  it('should map Squash to other', () => {
    expect(mapSportTypeToCategory('Squash')).toBe('other');
  });

  it('should map an unknown sport type to other', () => {
    expect(mapSportTypeToCategory('Skateboarding')).toBe('other');
  });

  it('should map an empty string to other', () => {
    expect(mapSportTypeToCategory('')).toBe('other');
  });

  it('should be case-sensitive and return other for lowercase ride', () => {
    expect(mapSportTypeToCategory('ride')).toBe('other');
  });

  it('should use prefix fallback for SkiJumping', () => {
    expect(mapSportTypeToCategory('SkiJumping')).toBe('winter');
  });

  it('should use prefix fallback for SkiTouring', () => {
    expect(mapSportTypeToCategory('SkiTouring')).toBe('winter');
  });
});

describe('formatSportType', () => {
  it('should format MountainBikeRide to Mountain Bike', () => {
    expect(formatSportType('MountainBikeRide')).toBe('Mountain Bike');
  });

  it('should format GravelRide to Gravel', () => {
    expect(formatSportType('GravelRide')).toBe('Gravel');
  });

  it('should format Run to Run', () => {
    expect(formatSportType('Run')).toBe('Run');
  });

  it('should format Kayaking to Kayaking', () => {
    expect(formatSportType('Kayaking')).toBe('Kayaking');
  });

  it('should format StandUpPaddling to Stand Up Paddling', () => {
    expect(formatSportType('StandUpPaddling')).toBe('Stand Up Paddling');
  });

  it('should format CrossCountrySkiing to Cross Country Skiing', () => {
    expect(formatSportType('CrossCountrySkiing')).toBe('Cross Country Skiing');
  });

  it('should format Workout to Workout', () => {
    expect(formatSportType('Workout')).toBe('Workout');
  });

  it('should format an unknown camelCase type', () => {
    expect(formatSportType('Skateboarding')).toBe('Skateboarding');
  });
});
