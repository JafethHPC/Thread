import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  ProactiveSuggestion,
  SuggestionAction,
} from '../components/proactive-suggestion-card/proactive-suggestion-card.component';

export interface SuggestionStats {
  timeframe: string;
  totalGenerated: number;
  totalAccepted: number;
  totalDismissed: number;
  acceptanceRate: number;
  byType: { [key: string]: number };
  byPriority: { [key: string]: number };
}

export interface SyncStatus {
  isRunning: boolean;
  intervalMinutes: number;
  nextSyncAt: string | null;
  lastSyncAt: string | null;
  nextSyncIn: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class ProactiveSuggestionsService {
  private baseUrl = 'http://localhost:3000/api/proactive-suggestions';

  // Observable for real-time suggestions updates
  private suggestionsSubject = new BehaviorSubject<ProactiveSuggestion[]>([]);
  public suggestions$ = this.suggestionsSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get active suggestions for the current user
   */
  getSuggestions(
    priority?: string,
    type?: string,
    limit?: number
  ): Observable<{ suggestions: ProactiveSuggestion[]; count: number }> {
    let params: any = {};
    if (priority) params.priority = priority;
    if (type) params.type = type;
    if (limit) params.limit = limit.toString();

    return this.http
      .get<{ suggestions: ProactiveSuggestion[]; count: number }>(
        this.baseUrl,
        { params }
      )
      .pipe(
        tap((response) => {
          this.suggestionsSubject.next(response.suggestions);
        })
      );
  }

  /**
   * Take action on a suggestion
   */
  takeSuggestionAction(
    suggestionId: number,
    action: SuggestionAction
  ): Observable<any> {
    return this.http
      .post(`${this.baseUrl}/${suggestionId}/action`, action)
      .pipe(
        tap(() => {
          // Refresh suggestions after action
          this.refreshSuggestions();
        })
      );
  }

  /**
   * Get suggestion statistics
   */
  getSuggestionStats(timeframe: string = '7d'): Observable<SuggestionStats> {
    return this.http.get<SuggestionStats>(`${this.baseUrl}/stats`, {
      params: { timeframe },
    });
  }

  /**
   * Manually trigger a sync
   */
  triggerSync(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/sync`,
      {}
    );
  }

  /**
   * Get sync status
   */
  getSyncStatus(): Observable<SyncStatus> {
    return this.http.get<SyncStatus>(`${this.baseUrl}/sync/status`);
  }

  /**
   * Update sync configuration
   */
  updateSyncConfig(
    intervalMinutes: number
  ): Observable<{ success: boolean; message: string; newInterval: number }> {
    return this.http.put<{
      success: boolean;
      message: string;
      newInterval: number;
    }>(`${this.baseUrl}/sync/config`, { intervalMinutes });
  }

  /**
   * Generate draft content for a suggestion
   */
  generateDraft(
    suggestionId: number
  ): Observable<{ success: boolean; draftContent?: string; error?: string }> {
    return this.http.get<{
      success: boolean;
      draftContent?: string;
      error?: string;
    }>(`${this.baseUrl}/${suggestionId}/draft`);
  }

  /**
   * Get suggested meeting times
   */
  getSuggestedTimes(
    duration: number = 30,
    daysAhead: number = 7
  ): Observable<{ success: boolean; suggestions?: any[]; error?: string }> {
    return this.http.get<{
      success: boolean;
      suggestions?: any[];
      error?: string;
    }>(`${this.baseUrl}/meeting-times`, {
      params: {
        duration: duration.toString(),
        daysAhead: daysAhead.toString(),
      },
    });
  }

  /**
   * Refresh suggestions (useful after actions)
   */
  refreshSuggestions(): void {
    this.getSuggestions().subscribe();
  }

  /**
   * Get current suggestions from the subject
   */
  getCurrentSuggestions(): ProactiveSuggestion[] {
    return this.suggestionsSubject.value;
  }

  /**
   * Filter suggestions by priority
   */
  filterByPriority(priority: 'high' | 'medium' | 'low'): ProactiveSuggestion[] {
    return this.getCurrentSuggestions().filter((s) => s.priority === priority);
  }

  /**
   * Filter suggestions by type
   */
  filterByType(type: string): ProactiveSuggestion[] {
    return this.getCurrentSuggestions().filter((s) => s.type === type);
  }

  /**
   * Get high priority suggestions count
   */
  getHighPriorityCount(): number {
    return this.filterByPriority('high').length;
  }

  /**
   * Check if there are any urgent suggestions (high priority, due soon)
   */
  hasUrgentSuggestions(): boolean {
    const urgent = this.getCurrentSuggestions().filter((s) => {
      if (s.priority !== 'high') return false;

      // Check if expires soon (within 1 hour)
      if (s.expiresAt) {
        const expires = new Date(s.expiresAt);
        const now = new Date();
        const diffMs = expires.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours <= 1;
      }

      return true; // High priority without expiration is considered urgent
    });

    return urgent.length > 0;
  }

  /**
   * Start polling for suggestions (useful for real-time updates)
   */
  startPolling(intervalMs: number = 60000): void {
    setInterval(() => {
      this.refreshSuggestions();
    }, intervalMs);
  }
}
