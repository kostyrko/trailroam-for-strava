import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ConfirmDialog, type ConfirmDialogData } from './confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  confirm(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, {
      data,
      disableClose: true,
      panelClass: `${environment.appSlug}-confirm-dialog`,
    });
    return firstValueFrom(ref.afterClosed()).then((result) => !!result);
  }
}
