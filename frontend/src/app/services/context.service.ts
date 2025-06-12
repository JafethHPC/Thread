import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ContextData {
  query: string;
  keywords: string[];
  emails: ContextEmail[];
  events: ContextEvent[];
  tasks: ContextTask[];
  people: ContextPerson[];
  timestamp: string;
}

export interface ContextEmail {
  id: string;
  from: string;
  email: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface ContextEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  attendees: string[];
}

export interface ContextTask {
  id: string;
  title: string;
  status: string;
  due?: string;
  notes?: string;
}

export interface ContextPerson {
  name: string;
  avatarUrl: string;
  email?: string;
  initials?: string;
  source?: string;
  showInitials?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ContextService {
  private contextSubject = new BehaviorSubject<ContextData | null>(null);
  public context$ = this.contextSubject.asObservable();

  constructor() {}

  updateContext(context: ContextData | null): void {
    this.contextSubject.next(context);
  }

  getCurrentContext(): ContextData | null {
    return this.contextSubject.value;
  }

  clearContext(): void {
    this.contextSubject.next(null);
  }
}
