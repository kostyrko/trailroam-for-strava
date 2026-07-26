import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { App } from './app';

describe('App shell smoke test (no Chrome APIs)', () => {
  it('should create the app component', () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    });

    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should compile without errors', () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    });

    expect(() => TestBed.createComponent(App)).not.toThrow();
  });
});

describe('Route redirects', () => {
  it('/activities redirects to /logbook preserving query params', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    });

    const router = TestBed.inject(Router);
    const nav = await router.navigateByUrl('/activities?focusActivityId=strava:123');
    expect(nav).toBe(true);
    expect(router.url).toBe('/logbook?focusActivityId=strava:123');
  });
});
