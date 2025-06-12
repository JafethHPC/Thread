import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-calendar-event-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-event-card.component.html',
  styleUrls: ['./calendar-event-card.component.scss'],
})
export class CalendarEventCardComponent {
  @Input() event: any;
}
