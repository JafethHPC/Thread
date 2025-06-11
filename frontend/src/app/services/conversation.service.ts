import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Conversation } from '../models/conversation';

@Injectable({
  providedIn: 'root',
})
export class ConversationService {
  private apiUrl = 'http://localhost:3000/api/conversations';
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  conversations$ = this.conversationsSubject.asObservable();
  private currentConversationSubject = new BehaviorSubject<Conversation | null>(
    null
  );
  currentConversation$ = this.currentConversationSubject.asObservable();

  constructor(private http: HttpClient) {}

  loadConversations(): Observable<Conversation[]> {
    return this.http
      .get<Conversation[]>(this.apiUrl)
      .pipe(
        tap((conversations) => this.conversationsSubject.next(conversations))
      );
  }

  loadConversation(id: string): Observable<Conversation> {
    return this.http
      .get<Conversation>(`${this.apiUrl}/${id}`)
      .pipe(
        tap((conversation) =>
          this.currentConversationSubject.next(conversation)
        )
      );
  }

  clearCurrentConversation() {
    this.currentConversationSubject.next(null);
  }
}
