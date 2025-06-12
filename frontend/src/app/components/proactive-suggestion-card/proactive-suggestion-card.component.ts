import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ProactiveSuggestion {
  id: number;
  type:
    | 'follow_up_email'
    | 'reminder_task_due'
    | 'schedule_meeting'
    | 'deadline_reminder'
    | 'unread_important';
  title: string;
  context: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'accepted' | 'dismissed' | 'completed';
  sourceData?: any;
  actionData?: any;
  createdAt: string;
  expiresAt?: string;
}

export interface SuggestionAction {
  action: 'accept' | 'dismiss' | 'snooze' | 'edit';
  userInput?: any;
}

@Component({
  selector: 'app-proactive-suggestion-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="suggestion-card" [ngClass]="'priority-' + suggestion.priority">
      <div class="suggestion-header">
        <div class="suggestion-type">
          <i [class]="getTypeIcon()"></i>
          <span class="type-label">{{ getTypeLabel() }}</span>
        </div>
        <div
          class="suggestion-priority"
          [ngClass]="'priority-' + suggestion.priority"
        >
          {{ suggestion.priority }}
        </div>
      </div>

      <div class="suggestion-content">
        <h4 class="suggestion-title">{{ suggestion.title }}</h4>
        <p class="suggestion-context">{{ suggestion.context }}</p>

        <div class="suggestion-meta">
          <span class="created-time">{{ getRelativeTime() }}</span>
          <span *ngIf="suggestion.expiresAt" class="expires-time">
            Expires {{ getExpiresTime() }}
          </span>
        </div>
      </div>

      <div class="suggestion-actions" *ngIf="!isProcessing">
        <button
          class="action-btn primary"
          (click)="handleAction('accept')"
          [disabled]="isProcessing"
        >
          <i class="fas fa-check"></i>
          {{ getAcceptLabel() }}
        </button>

        <button
          class="action-btn secondary"
          (click)="showEditModal = true"
          [disabled]="isProcessing"
          *ngIf="canEdit()"
        >
          <i class="fas fa-edit"></i>
          Edit
        </button>

        <button
          class="action-btn tertiary"
          (click)="showSnoozeModal = true"
          [disabled]="isProcessing"
        >
          <i class="fas fa-clock"></i>
          Snooze
        </button>

        <button
          class="action-btn dismiss"
          (click)="handleAction('dismiss')"
          [disabled]="isProcessing"
        >
          <i class="fas fa-times"></i>
          Dismiss
        </button>
      </div>

      <div class="processing-indicator" *ngIf="isProcessing">
        <i class="fas fa-spinner fa-spin"></i>
        Processing...
      </div>
    </div>

    <!-- Snooze Modal -->
    <div
      class="modal-overlay"
      *ngIf="showSnoozeModal"
      (click)="showSnoozeModal = false"
    >
      <div class="modal-content" (click)="$event.stopPropagation()">
        <h3>Snooze Suggestion</h3>
        <p>How long would you like to snooze this suggestion?</p>

        <div class="snooze-options">
          <button
            *ngFor="let option of snoozeOptions"
            class="snooze-option"
            (click)="snooze(option.minutes)"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="modal-actions">
          <button
            class="action-btn secondary"
            (click)="showSnoozeModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div
      class="modal-overlay"
      *ngIf="showEditModal"
      (click)="showEditModal = false"
    >
      <div class="modal-content edit-modal" (click)="$event.stopPropagation()">
        <h3>Edit Suggestion</h3>

        <div class="edit-form" [ngSwitch]="suggestion.type">
          <!-- Email editing -->
          <div *ngSwitchCase="'follow_up_email'">
            <label>Email Subject:</label>
            <input
              type="text"
              [(ngModel)]="editData.subject"
              [placeholder]="suggestion.actionData?.subject || 'Email subject'"
            />

            <label>Email Content:</label>
            <textarea
              [(ngModel)]="editData.content"
              rows="6"
              [placeholder]="
                suggestion.actionData?.draftContent || 'Email content'
              "
            >
            </textarea>
          </div>

          <!-- Meeting scheduling -->
          <div *ngSwitchCase="'schedule_meeting'">
            <label>Meeting Title:</label>
            <input
              type="text"
              [(ngModel)]="editData.summary"
              [placeholder]="suggestion.actionData?.summary || 'Meeting title'"
            />

            <label>Duration (minutes):</label>
            <input
              type="number"
              [(ngModel)]="editData.duration"
              [value]="30"
              min="15"
              max="240"
            />

            <label>Participants (comma-separated emails):</label>
            <input
              type="text"
              [(ngModel)]="editData.participants"
              placeholder="email1@example.com, email2@example.com"
            />
          </div>

          <!-- Task reminder -->
          <div *ngSwitchCase="'reminder_task_due'">
            <label>New Due Date:</label>
            <input type="datetime-local" [(ngModel)]="editData.newDueDate" />

            <label>Task Notes:</label>
            <textarea
              [(ngModel)]="editData.notes"
              rows="3"
              placeholder="Additional notes for the task"
            >
            </textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button
            class="action-btn primary"
            (click)="handleEditedAction()"
            [disabled]="!isEditDataValid()"
          >
            Apply Changes
          </button>
          <button class="action-btn secondary" (click)="showEditModal = false">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./proactive-suggestion-card.component.css'],
})
export class ProactiveSuggestionCardComponent {
  @Input() suggestion!: ProactiveSuggestion;
  @Output() actionTaken = new EventEmitter<SuggestionAction>();

  isProcessing = false;
  showSnoozeModal = false;
  showEditModal = false;
  editData: any = {};

  snoozeOptions = [
    { label: '15 minutes', minutes: 15 },
    { label: '1 hour', minutes: 60 },
    { label: '4 hours', minutes: 240 },
    { label: '1 day', minutes: 1440 },
    { label: '1 week', minutes: 10080 },
  ];

  getTypeIcon(): string {
    const icons = {
      follow_up_email: 'fas fa-reply',
      reminder_task_due: 'fas fa-tasks',
      schedule_meeting: 'fas fa-calendar-plus',
      deadline_reminder: 'fas fa-exclamation-triangle',
      unread_important: 'fas fa-envelope',
    };
    return icons[this.suggestion.type] || 'fas fa-info-circle';
  }

  getTypeLabel(): string {
    const labels = {
      follow_up_email: 'Follow Up',
      reminder_task_due: 'Task Due',
      schedule_meeting: 'Schedule Meeting',
      deadline_reminder: 'Deadline',
      unread_important: 'Important Email',
    };
    return labels[this.suggestion.type] || 'Suggestion';
  }

  getAcceptLabel(): string {
    const labels = {
      follow_up_email: 'Send Reply',
      reminder_task_due: 'Mark Complete',
      schedule_meeting: 'Schedule',
      deadline_reminder: 'Set Reminder',
      unread_important: 'Mark Read',
    };
    return labels[this.suggestion.type] || 'Accept';
  }

  canEdit(): boolean {
    return [
      'follow_up_email',
      'schedule_meeting',
      'reminder_task_due',
    ].includes(this.suggestion.type);
  }

  getRelativeTime(): string {
    const now = new Date();
    const created = new Date(this.suggestion.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  getExpiresTime(): string {
    if (!this.suggestion.expiresAt) return '';

    const expires = new Date(this.suggestion.expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return 'expired';
    if (diffMins < 60) return `in ${diffMins}m`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `in ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `in ${diffDays}d`;
  }

  handleAction(action: 'accept' | 'dismiss'): void {
    this.isProcessing = true;
    this.actionTaken.emit({ action });
  }

  snooze(minutes: number): void {
    this.showSnoozeModal = false;
    this.isProcessing = true;
    this.actionTaken.emit({
      action: 'snooze',
      userInput: { minutes },
    });
  }

  handleEditedAction(): void {
    this.showEditModal = false;
    this.isProcessing = true;
    this.actionTaken.emit({
      action: 'edit',
      userInput: { editedData: this.editData },
    });
  }

  isEditDataValid(): boolean {
    switch (this.suggestion.type) {
      case 'follow_up_email':
        return !!(this.editData.subject && this.editData.content);
      case 'schedule_meeting':
        return !!(this.editData.summary && this.editData.duration);
      case 'reminder_task_due':
        return !!this.editData.newDueDate;
      default:
        return true;
    }
  }
}
