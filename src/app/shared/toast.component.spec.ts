import { TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from './toast.service';

describe('ToastComponent', () => {
  it('should create', () => {
    TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [ToastService],
    });
    const fixture = TestBed.createComponent(ToastComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
