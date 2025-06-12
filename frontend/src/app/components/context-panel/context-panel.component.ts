import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import {
  ContextService,
  ContextData,
  ContextPerson,
} from '../../services/context.service';
import { EmailCardComponent } from '../email-card/email-card.component';
import { CalendarEventCardComponent } from '../calendar-event-card/calendar-event-card.component';

@Component({
  selector: 'app-context-panel',
  standalone: true,
  imports: [CommonModule, EmailCardComponent, CalendarEventCardComponent],
  templateUrl: './context-panel.component.html',
  styleUrls: ['./context-panel.component.css'],
})
export class ContextPanelComponent implements OnInit {
  context$: Observable<ContextData | null>;

  constructor(private contextService: ContextService) {
    this.context$ = this.contextService.context$;
  }

  ngOnInit(): void {}

  // Helper method to format dates
  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return dateString;
    }
  }

  // Helper method to get task status color
  getTaskStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'text-green-600';
      case 'needsaction':
        return 'text-orange-600';
      default:
        return 'text-gray-600';
    }
  }

  // Helper method to format task status
  formatTaskStatus(status: string): string {
    switch (status?.toLowerCase()) {
      case 'needsaction':
        return 'Needs Action';
      case 'completed':
        return 'Completed';
      default:
        return status || 'Unknown';
    }
  }

  // Handle avatar loading errors
  onAvatarError(event: any, person: ContextPerson): void {
    person.showInitials = true;
  }

  // Get person initials
  getPersonInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // Get consistent color for person based on name
  getPersonColor(name: string): string {
    const colors = [
      '#3B82F6',
      '#EF4444',
      '#10B981',
      '#F59E0B',
      '#8B5CF6',
      '#EC4899',
      '#06B6D4',
      '#84CC16',
      '#F97316',
      '#6366F1',
    ];
    const index = name.length % colors.length;
    return colors[index];
  }
}
