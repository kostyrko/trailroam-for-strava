import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';

interface MaterialComponentCheck {
  component: string;
  status: string;
}

@Component({
  selector: 'app-material-readiness-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Material dialog ready</h2>
    <mat-dialog-content>
      Button, card, table, and dialog components are available to the app shell.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
})
export class MaterialReadinessDialog {}

@Component({
  selector: 'app-root',
  imports: [MatButtonModule, MatCardModule, MatDialogModule, MatTableModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('Trailroam for Strava');
  protected readonly displayedColumns = ['component', 'status'];
  protected readonly componentChecks: MaterialComponentCheck[] = [
    { component: 'Button', status: 'Available' },
    { component: 'Card', status: 'Available' },
    { component: 'Table', status: 'Available' },
    { component: 'Dialog', status: 'Available' },
  ];

  constructor(private readonly dialog: MatDialog) {}

  protected openReadinessDialog(): void {
    this.dialog.open(MaterialReadinessDialog);
  }
}
