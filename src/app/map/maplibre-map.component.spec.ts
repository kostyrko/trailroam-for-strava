import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type Map } from 'maplibre-gl';
import { MapLibreMapComponent } from './maplibre-map.component';
import { MapLibreService } from './maplibre.service';

describe('MapLibreMapComponent', () => {
  let createMap: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<MapLibreMapComponent>;

  beforeEach(() => {
    remove = vi.fn();
    createMap = vi.fn().mockResolvedValue({ remove } as unknown as Map);

    TestBed.configureTestingModule({
      imports: [MapLibreMapComponent],
      providers: [
        {
          provide: MapLibreService,
          useValue: { createMap },
        },
      ],
    });
  });

  it('should initialize MapLibre in the map container', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const container = fixture.nativeElement.querySelector('.map-container') as HTMLElement;
    expect(createMap).toHaveBeenCalledWith(container);
  });

  it('should remove the MapLibre map on destroy', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.destroy();

    expect(remove).toHaveBeenCalledOnce();
  });

  it('should remove the MapLibre map if initialization finishes after destroy', async () => {
    fixture = TestBed.createComponent(MapLibreMapComponent);
    fixture.detectChanges();

    fixture.destroy();
    await fixture.whenStable();

    expect(remove).toHaveBeenCalledOnce();
  });
});
