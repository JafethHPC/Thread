import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  ProactiveSuggestionsService,
  SuggestionStats,
  SyncStatus,
} from '../../services/proactive-suggestions.service';
import {
  ProactiveSuggestionCardComponent,
  ProactiveSuggestion,
  SuggestionAction,
} from '../proactive-suggestion-card/proactive-suggestion-card.component';

@Component({
  selector: 'app-proactive-suggestions-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ProactiveSuggestionCardComponent],
  template: `
    <div class="suggestions-panel">
      <div class="panel-header">
        <div class="header-left">
          <h3>
            <i class="fas fa-lightbulb"></i>
            Proactive Suggestions
            <span class="suggestion-count" *ngIf="suggestions.length > 0">
              {{ suggestions.length }}
            </span>
            <span class="urgent-indicator" *ngIf="hasUrgent">
              <i class="fas fa-exclamation-circle"></i>
            </span>
          </h3>
          <p class="panel-subtitle">
            AI-powered suggestions to help you stay on top of things
          </p>
        </div>

        <div class="header-actions">
          <button
            class="sync-btn"
            (click)="triggerSync()"
            [disabled]="isSyncing"
            [title]="'Last sync: ' + getLastSyncText()"
          >
            <i
              class="fas"
              [class.fa-sync]="!isSyncing"
              [class.fa-spinner]="isSyncing"
              [class.fa-spin]="isSyncing"
            ></i>
            {{ isSyncing ? 'Syncing...' : 'Sync Now' }}
          </button>

          <button class="filter-btn" (click)="showFilters = !showFilters">
            <i class="fas fa-filter"></i>
            Filters
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-section" *ngIf="showFilters">
        <div class="filter-group">
          <label>Priority:</label>
          <select [(ngModel)]="selectedPriority" (change)="applyFilters()">
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div class="filter-group">
          <label>Type:</label>
          <select [(ngModel)]="selectedType" (change)="applyFilters()">
            <option value="">All Types</option>
            <option value="follow_up_email">Follow Up Email</option>
            <option value="reminder_task_due">Task Due</option>
            <option value="schedule_meeting">Schedule Meeting</option>
            <option value="deadline_reminder">Deadline</option>
            <option value="unread_important">Important Email</option>
          </select>
        </div>

        <div class="filter-group">
          <label>Limit:</label>
          <select [(ngModel)]="selectedLimit" (change)="applyFilters()">
            <option value="5">5 suggestions</option>
            <option value="10">10 suggestions</option>
            <option value="20">20 suggestions</option>
          </select>
        </div>
      </div>

      <!-- Sync Status -->
      <div class="sync-status" *ngIf="syncStatus">
        <div class="status-item">
          <span class="status-label">Sync Status:</span>
          <span class="status-value" [class.active]="syncStatus.isRunning">
            {{ syncStatus.isRunning ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <div class="status-item" *ngIf="syncStatus.nextSyncIn !== null">
          <span class="status-label">Next Sync:</span>
          <span class="status-value">{{ syncStatus.nextSyncIn }}m</span>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="isLoading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading suggestions...</span>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!isLoading && suggestions.length === 0">
        <i class="fas fa-check-circle"></i>
        <h4>All caught up!</h4>
        <p>
          No suggestions at the moment. We'll notify you when there's something
          to follow up on.
        </p>
        <button class="refresh-btn" (click)="refreshSuggestions()">
          <i class="fas fa-refresh"></i>
          Check Again
        </button>
      </div>

      <!-- Suggestions List -->
      <div
        class="suggestions-list"
        *ngIf="!isLoading && suggestions.length > 0"
      >
        <app-proactive-suggestion-card
          *ngFor="let suggestion of suggestions; trackBy: trackBySuggestionId"
          [suggestion]="suggestion"
          (actionTaken)="handleSuggestionAction(suggestion.id, $event)"
        >
        </app-proactive-suggestion-card>
      </div>

      <!-- Stats Summary -->
      <div class="stats-summary" *ngIf="stats && suggestions.length > 0">
        <div class="stats-header">
          <h4>This Week's Activity</h4>
        </div>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ stats.totalGenerated }}</span>
            <span class="stat-label">Generated</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ stats.totalAccepted }}</span>
            <span class="stat-label">Accepted</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ stats.acceptanceRate }}%</span>
            <span class="stat-label">Acceptance Rate</span>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="errorMessage">
        <i class="fas fa-exclamation-triangle"></i>
        <p>{{ errorMessage }}</p>
        <button class="retry-btn" (click)="refreshSuggestions()">
          <i class="fas fa-redo"></i>
          Try Again
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./proactive-suggestions-panel.component.css'],
})
export class ProactiveSuggestionsPanelComponent implements OnInit, OnDestroy {
  suggestions: ProactiveSuggestion[] = [];
  stats: SuggestionStats | null = null;
  syncStatus: SyncStatus | null = null;

  isLoading = false;
  isSyncing = false;
  showFilters = false;
  hasUrgent = false;
  errorMessage = '';

  // Filters
  selectedPriority = '';
  selectedType = '';
  selectedLimit = 10;

  private subscriptions: Subscription[] = [];

  constructor(private suggestionsService: ProactiveSuggestionsService) {}

  ngOnInit(): void {
    this.loadSuggestions();
    this.loadStats();
    this.loadSyncStatus();

    // Subscribe to suggestions updates
    const suggestionsSubscription =
      this.suggestionsService.suggestions$.subscribe((suggestions) => {
        this.suggestions = suggestions;
        this.hasUrgent = this.suggestionsService.hasUrgentSuggestions();
      });
    this.subscriptions.push(suggestionsSubscription);

    // Start polling for updates every minute
    this.suggestionsService.startPolling(60000);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  loadSuggestions(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.suggestionsService
      .getSuggestions(
        this.selectedPriority || undefined,
        this.selectedType || undefined,
        this.selectedLimit
      )
      .subscribe({
        next: (response) => {
          this.suggestions = response.suggestions;
          this.hasUrgent = this.suggestionsService.hasUrgentSuggestions();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading suggestions:', error);
          this.errorMessage = 'Failed to load suggestions. Please try again.';
          this.isLoading = false;
        },
      });
  }

  loadStats(): void {
    this.suggestionsService.getSuggestionStats('7d').subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (error) => {
        console.error('Error loading stats:', error);
      },
    });
  }

  loadSyncStatus(): void {
    this.suggestionsService.getSyncStatus().subscribe({
      next: (status) => {
        this.syncStatus = status;
      },
      error: (error) => {
        console.error('Error loading sync status:', error);
      },
    });
  }

  applyFilters(): void {
    this.loadSuggestions();
  }

  refreshSuggestions(): void {
    this.loadSuggestions();
    this.loadStats();
  }

  triggerSync(): void {
    this.isSyncing = true;
    this.suggestionsService.triggerSync().subscribe({
      next: (response) => {
        console.log('Sync completed:', response.message);
        this.isSyncing = false;
        // Refresh suggestions after sync
        setTimeout(() => {
          this.refreshSuggestions();
        }, 2000);
      },
      error: (error) => {
        console.error('Sync failed:', error);
        this.isSyncing = false;
      },
    });
  }

  handleSuggestionAction(suggestionId: number, action: SuggestionAction): void {
    this.suggestionsService
      .takeSuggestionAction(suggestionId, action)
      .subscribe({
        next: (response) => {
          console.log('Action completed:', response);
          // Suggestions will be automatically refreshed by the service
        },
        error: (error) => {
          console.error('Action failed:', error);
          // Reset the suggestion's processing state
          const suggestion = this.suggestions.find(
            (s) => s.id === suggestionId
          );
          if (suggestion) {
            // You might want to emit an event to reset the card's processing state
          }
        },
      });
  }

  trackBySuggestionId(index: number, suggestion: ProactiveSuggestion): number {
    return suggestion.id;
  }

  getLastSyncText(): string {
    if (!this.syncStatus?.lastSyncAt) {
      return 'Never';
    }

    const lastSync = new Date(this.syncStatus.lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}
