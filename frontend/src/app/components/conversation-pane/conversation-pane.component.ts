import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { TaskListComponent } from '../task-list/task-list.component';

import { EmailCardComponent } from '../email-card/email-card.component';
import { CalendarEventCardComponent } from '../calendar-event-card/calendar-event-card.component';
import { ConversationService } from '../../services/conversation.service';
import { Message, Conversation } from '../../models/conversation';

@Component({
  selector: 'app-conversation-pane',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    TaskListComponent,
    EmailCardComponent,
    CalendarEventCardComponent,
  ],
  templateUrl: './conversation-pane.component.html',
  styleUrls: ['./conversation-pane.component.css'],
})
export class ConversationPaneComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatContainer', { static: false })
  private chatContainer!: ElementRef;

  messages$: Observable<Message[]>;
  newMessage: string = '';
  isLoading: boolean = false;
  isAuthenticated$: Observable<boolean>;
  currentConversation$: Observable<Conversation | null>;
  private apiUrl = 'http://localhost:3000/api/ai/chat';
  private authUrl = 'http://localhost:3000/api/google/auth';
  private shouldScrollToBottom = true;

  // Email limiting functionality
  expandedEmailMessages = new Set<string>(); // Track which messages have expanded emails
  emailDisplayLimit = 3;

  // Task limiting functionality
  expandedTaskMessages = new Set<string>(); // Track which messages have expanded tasks
  taskDisplayLimit = 3; // Show only 3 emails initially

  constructor(
    private http: HttpClient,
    public authService: AuthService,
    private conversationService: ConversationService
  ) {
    this.isAuthenticated$ = this.authService.user$.pipe(map((user) => !!user));
    this.messages$ = this.conversationService.messages$;
    this.currentConversation$ = this.conversationService.currentConversation$;
  }

  // Make JSON available in template
  JSON = JSON;

  // Helper method to format message content
  formatMessageContent(content: any): string {
    let result = '';

    if (typeof content === 'string') {
      result = content;
    } else if (content && typeof content === 'object') {
      // If it's an object, try to extract meaningful text
      if (content.text) {
        result = content.text;
      } else if (content.content) {
        result = content.content;
      } else if (content.message) {
        result = content.message;
      } else {
        // Fallback to JSON string for debugging
        result = JSON.stringify(content);
      }
    } else {
      result = String(content);
    }

    // CRITICAL: Ensure all trailing whitespace, newlines, and extra spaces are removed
    return result
      .trim()
      .replace(/\s+$/, '')
      .replace(/\n+$/, '')
      .replace(/\r+$/, '');
  }

  // Helper method to safely get emails array
  getEmailsArray(content: any): any[] {
    console.log('Email content:', content, 'Type:', typeof content);

    // If content is already an array, return it
    if (Array.isArray(content)) {
      return content;
    }

    // If content is an object with a content property that's an array
    if (
      content &&
      typeof content === 'object' &&
      Array.isArray(content.content)
    ) {
      return content.content;
    }

    // If content is an object with emails property
    if (
      content &&
      typeof content === 'object' &&
      Array.isArray(content.emails)
    ) {
      return content.emails;
    }

    // Fallback: return empty array to prevent errors
    console.warn('Email content is not an array:', content);
    return [];
  }

  // Get limited emails for display (max 3 initially)
  getLimitedEmails(content: any, messageId: string): any[] {
    const allEmails = this.getEmailsArray(content);
    const isExpanded = this.expandedEmailMessages.has(messageId);

    if (isExpanded || allEmails.length <= this.emailDisplayLimit) {
      return allEmails;
    }

    return allEmails.slice(0, this.emailDisplayLimit);
  }

  // Check if message has more emails than the limit
  hasMoreEmails(content: any, messageId: string): boolean {
    const allEmails = this.getEmailsArray(content);
    const isExpanded = this.expandedEmailMessages.has(messageId);
    return !isExpanded && allEmails.length > this.emailDisplayLimit;
  }

  // Get the count of hidden emails
  getHiddenEmailCount(content: any, messageId: string): number {
    const allEmails = this.getEmailsArray(content);
    const isExpanded = this.expandedEmailMessages.has(messageId);

    if (isExpanded || allEmails.length <= this.emailDisplayLimit) {
      return 0;
    }

    return allEmails.length - this.emailDisplayLimit;
  }

  // Toggle email expansion for a specific message
  toggleEmailExpansion(messageId: string): void {
    if (this.expandedEmailMessages.has(messageId)) {
      this.expandedEmailMessages.delete(messageId);
    } else {
      this.expandedEmailMessages.add(messageId);
    }
  }

  // Check if emails are expanded for a message
  areEmailsExpanded(messageId: string): boolean {
    return this.expandedEmailMessages.has(messageId);
  }

  // Helper method to safely get tasks array
  getTasksArray(content: any): any[] {
    console.log('Task content:', content, 'Type:', typeof content);

    // If content is already an array, return it
    if (Array.isArray(content)) {
      return content;
    }

    // If content is an object with a content property that's an array
    if (
      content &&
      typeof content === 'object' &&
      Array.isArray(content.content)
    ) {
      return content.content;
    }

    // If content is an object with tasks property
    if (
      content &&
      typeof content === 'object' &&
      Array.isArray(content.tasks)
    ) {
      return content.tasks;
    }

    // Fallback: return empty array to prevent errors
    console.warn('Task content is not an array:', content);
    return [];
  }

  // Get limited tasks for display (max 3 initially)
  getLimitedTasks(content: any, messageId: string): any[] {
    const allTasks = this.getTasksArray(content);
    const isExpanded = this.expandedTaskMessages.has(messageId);

    if (isExpanded || allTasks.length <= this.taskDisplayLimit) {
      return allTasks;
    }

    return allTasks.slice(0, this.taskDisplayLimit);
  }

  // Check if message has more tasks than the limit
  hasMoreTasks(content: any, messageId: string): boolean {
    const allTasks = this.getTasksArray(content);
    const isExpanded = this.expandedTaskMessages.has(messageId);
    return !isExpanded && allTasks.length > this.taskDisplayLimit;
  }

  // Get the count of hidden tasks
  getHiddenTaskCount(content: any, messageId: string): number {
    const allTasks = this.getTasksArray(content);
    const isExpanded = this.expandedTaskMessages.has(messageId);

    if (isExpanded || allTasks.length <= this.taskDisplayLimit) {
      return 0;
    }

    return allTasks.length - this.taskDisplayLimit;
  }

  // Toggle task expansion for a specific message
  toggleTaskExpansion(messageId: string): void {
    if (this.expandedTaskMessages.has(messageId)) {
      this.expandedTaskMessages.delete(messageId);
    } else {
      this.expandedTaskMessages.add(messageId);
    }
  }

  // Check if tasks are expanded for a message
  areTasksExpanded(messageId: string): boolean {
    return this.expandedTaskMessages.has(messageId);
  }

  ngOnInit(): void {
    // Listen for loading state changes from the service if needed

    // Subscribe to messages changes to trigger scroll
    this.messages$.subscribe(() => {
      this.shouldScrollToBottom = true;
    });

    // Subscribe to conversation changes to trigger scroll
    this.currentConversation$.subscribe(() => {
      this.shouldScrollToBottom = true;
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop =
          this.chatContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  loginWithGoogle(): void {
    window.location.href = 'http://localhost:3000/api/google/auth';
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;

    this.isLoading = true;
    const messageToSend = this.newMessage;
    this.newMessage = '';

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    this.conversationService
      .sendMessage(messageToSend, userTimezone)
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.shouldScrollToBottom = true;
          // The service handles updating the messages list and context
        },
        error: (error) => {
          // The service could potentially handle this too,
          // but for now, we can add a temporary error message
          // This part would need refinement
          this.isLoading = false;
          console.error(error);
        },
      });
  }

  private parseTasks(response: string): any[] {
    const tasks = response.replace('Tasks: ', '').split(/\d+\./);
    return tasks
      .filter((t) => t.trim() !== '')
      .map((taskString) => {
        const titleMatch = taskString.match(/^(.*?)\s-\sID:/);
        const idMatch = taskString.match(/ID: (.*?)\s-/);
        const statusMatch = taskString.match(/Status: (.*?)\s-/);
        const linkMatch = taskString.match(/Link: \[(.*?)\]\((.*?)\)/);
        const dueDateMatch = taskString.match(/Due Date: (.*?)\s-/);

        return {
          title: titleMatch ? titleMatch[1].trim() : 'No Title',
          id: idMatch ? idMatch[1] : '',
          status: statusMatch ? statusMatch[1] : 'No Status',
          link: linkMatch ? linkMatch[2] : '#',
          linkText: linkMatch ? linkMatch[1] : 'Link',
          dueDate: dueDateMatch ? dueDateMatch[1] : null,
        };
      });
  }

  private parseEmail(response: string): any {
    const fromMatch = response.match(/from (.*?)\s</);
    const emailMatch = response.match(/<(.*?)>/);
    const subjectMatch = response.match(/subject "(.*?)"/);
    const bodyMatch = response.match(
      /The email mentions that (.*?)( and advises|$)/
    );

    return {
      from: fromMatch ? fromMatch[1] : 'Unknown Sender',
      email: emailMatch ? emailMatch[1] : '',
      subject: subjectMatch ? subjectMatch[1] : 'No Subject',
      body: bodyMatch ? bodyMatch[1].trim() : 'No body found in the email',
    };
  }
}
