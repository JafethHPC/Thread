import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, catchError, of } from 'rxjs';
import { Message, Conversation } from '../models/conversation';
import { ContextService, ContextData } from './context.service';

@Injectable({
  providedIn: 'root',
})
export class ConversationService {
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  private currentConversationSubject = new BehaviorSubject<Conversation | null>(
    null
  );

  public conversations$ = this.conversationsSubject.asObservable();
  public messages$ = this.messagesSubject.asObservable();
  public currentConversation$ = this.currentConversationSubject.asObservable();

  private apiUrl = 'http://localhost:3000/api';

  constructor(
    private http: HttpClient,
    private router: Router,
    private contextService: ContextService
  ) {}

  // Get all conversations for the current user
  getConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.apiUrl}/conversations`).pipe(
      tap((conversations) => {
        this.conversationsSubject.next(conversations);
      })
    );
  }

  // Get a specific conversation with messages
  getConversation(id: number): Observable<Conversation> {
    return this.http
      .get<Conversation>(`${this.apiUrl}/conversations/${id}`)
      .pipe(
        tap((conversation) => {
          this.currentConversationSubject.next(conversation);
          const msgs = conversation.messages || [];
          this.messagesSubject.next(msgs);

          // Try to restore context from the last stored context message
          const lastCtx = [...msgs]
            .reverse()
            .find((m: any) => m.type === 'context');

          if (lastCtx) {
            this.contextService.updateContext(lastCtx.content);
          } else {
            this.contextService.clearContext();
          }
        })
      );
  }

  // Send a message and get AI response
  sendMessage(
    message: string,
    timezone: string = 'America/New_York'
  ): Observable<{
    response: any;
    context?: ContextData;
    conversationId: string;
  }> {
    const currentConversation = this.currentConversationSubject.value;
    const currentMessages = this.messagesSubject.value;

    // Create and show user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: { type: 'text', content: message },
      type: 'text',
      conversationId: currentConversation?.id?.toString() || 'temp',
      createdAt: new Date().toISOString(),
    };

    // Add user message to UI immediately
    const messagesWithUserMessage = [...currentMessages, userMessage];
    this.messagesSubject.next(messagesWithUserMessage);

    const payload = {
      message,
      timezone,
      history: currentMessages,
      conversationId: currentConversation?.id,
    };

    return this.http
      .post<{ response: any; context?: ContextData; conversationId: string }>(
        `${this.apiUrl}/ai/chat`,
        payload
      )
      .pipe(
        tap((result) => {
          // Update context if provided
          if (result.context) {
            this.contextService.updateContext(result.context);
          }

          // Update the user message with correct conversation ID
          const updatedUserMessage: Message = {
            ...userMessage,
            conversationId: result.conversationId,
          };

          // Create assistant message
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.response,
            type: result.response.type,
            conversationId: result.conversationId,
            createdAt: new Date().toISOString(),
          };

          // Update messages with both user and assistant messages
          const updatedMessages = [
            ...currentMessages,
            updatedUserMessage,
            assistantMessage,
          ];
          this.messagesSubject.next(updatedMessages);

          // Update current conversation if needed
          const conversationIdNumber = parseInt(result.conversationId);
          if (
            !currentConversation ||
            parseInt(currentConversation.id) !== conversationIdNumber
          ) {
            // If this is a new conversation, navigate to its URL
            // Check if we're not already on the correct URL to avoid unnecessary navigation
            const currentUrl = this.router.url;
            const expectedUrl = `/dashboard/c/${result.conversationId}`;

            if (currentUrl !== expectedUrl) {
              this.router.navigate(['/dashboard/c', result.conversationId]);
            }

            // Load the conversation data
            this.getConversation(conversationIdNumber).subscribe();
          }
        }),
        catchError((error) => {
          // If there's an error, remove the user message from UI or show error state
          console.error('Error sending message:', error);
          this.messagesSubject.next(currentMessages); // Revert to original messages
          throw error;
        })
      );
  }

  // Create a new conversation
  createConversation(): void {
    // Clear current conversation and messages
    this.currentConversationSubject.next(null);
    this.messagesSubject.next([]);
    this.contextService.clearContext();
  }

  // Delete a conversation
  deleteConversation(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/conversations/${id}`).pipe(
      tap(() => {
        // Refresh conversations list after deletion
        this.getConversations().subscribe();

        // If the deleted conversation was the current one, clear it
        const currentConversation = this.currentConversationSubject.value;
        if (currentConversation && currentConversation.id.toString() === id) {
          this.currentConversationSubject.next(null);
          this.messagesSubject.next([]);
          this.contextService.clearContext();
        }
      }),
      catchError((error) => {
        console.error('Error deleting conversation:', error);
        return of(null);
      })
    );
  }

  // Delete all conversations
  deleteAllConversations(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/conversations`).pipe(
      tap(() => {
        // Clear local state
        this.conversationsSubject.next([]);
        this.currentConversationSubject.next(null);
        this.messagesSubject.next([]);
        this.contextService.clearContext();
      })
    );
  }
}
