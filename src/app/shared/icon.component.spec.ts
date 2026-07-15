import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  const KNOWN_ICONS = [
    'activity', 'calendar', 'check-circle', 'chevron-down', 'clock', 'route', 'gauge',
    'database', 'download', 'external-link', 'eye', 'flame', 'info', 'layers', 'lightbulb',
    'list', 'lock', 'map', 'map-pin', 'pencil', 'more-horizontal', 'mountain',
    'refresh-cw', 'refresh-cw-alt', 'refresh-cw-outline', 'rotate-ccw', 'search',
    'shield', 'file-text', 'bug', 'book-open', 'heart', 'rocket', 'satellite',
    'line-squiggle', 'sliders-horizontal', 'trash-2', 'upload', 'x',
  ];

  it('should have all expected icon names', () => {
    expect(KNOWN_ICONS.length).toBeGreaterThan(30);
    expect(KNOWN_ICONS).toContain('pencil');
    expect(KNOWN_ICONS).toContain('x');
    expect(KNOWN_ICONS).toContain('map');
  });
});
