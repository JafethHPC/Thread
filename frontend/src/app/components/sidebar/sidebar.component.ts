import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';
import { ConversationService } from '../../services/conversation.service';
import { Observable } from 'rxjs';
import { Conversation } from '../../models/conversation';
import { map, filter, switchMap, take } from 'rxjs/operators';
import { of } from 'rxjs';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';

@Pipe({
  name: 'safeHtml',
  standalone: true,
})
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}
  transform(value: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, SafeHtmlPipe, ConfirmationModalComponent],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;
  @Output() openSettings = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();

  user: User | null = null;
  conversations$: Observable<Conversation[]>;
  currentConversationId$: Observable<string | null>;

  // Modal state
  showDeleteModal = false;
  conversationToDelete: string | null = null;

  recentConversations = [
    {
      title: 'Marketing Strategy Q4',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.96 8.96 0 01-4.906-1.681L3 21l2.319-5.094A7.96 7.96 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z"></path>',
      active: true,
    },
    {
      title: 'Product Roadmap Review',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>',
      active: false,
    },
    {
      title: 'Team Standup Notes',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>',
      active: false,
    },
    {
      title: 'Budget Planning 2024',
      icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
      active: false,
    },
  ];

  constructor(
    private authService: AuthService,
    private conversationService: ConversationService,
    private router: Router
  ) {
    this.conversations$ = this.authService.isInitialized$.pipe(
      filter((isInitialized) => isInitialized),
      switchMap(() => this.conversationService.conversations$)
    );

    this.currentConversationId$ =
      this.conversationService.currentConversation$.pipe(
        map((conversation) => conversation?.id?.toString() || null)
      );
  }

  ngOnInit(): void {
    // Subscribe to user data from auth service
    this.authService.user$.subscribe((user) => {
      this.user = user;
    });

    // Load conversations when initialized
    this.authService.isInitialized$
      .pipe(
        filter((isInitialized) => isInitialized),
        switchMap(() => this.conversationService.getConversations())
      )
      .subscribe();
  }

  newConversation(): void {
    // Navigate to dashboard root for new conversation
    this.router.navigate(['/dashboard']);
  }

  selectConversation(id: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // Navigate to specific conversation URL
    this.router.navigate(['/dashboard/c', id]);
  }

  deleteConversation(id: string, event: MouseEvent): void {
    event.stopPropagation(); // Prevent the conversation from being selected
    this.conversationToDelete = id;
    this.showDeleteModal = true;
  }

  confirmDelete(): void {
    if (this.conversationToDelete) {
      this.conversationService
        .deleteConversation(this.conversationToDelete)
        .subscribe();
    }
    this.closeDeleteModal();
  }

  cancelDelete(): void {
    this.closeDeleteModal();
  }

  private closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.conversationToDelete = null;
  }

  getUserAvatar(): string {
    if (this.user?.profilePicture) {
      return this.user.profilePicture;
    }
    // Fallback to a default avatar or generate one based on user initials
    return this.generateDefaultAvatar();
  }

  private generateDefaultAvatar(): string {
    if (this.user?.name) {
      const initials = this.user.name
        .split(' ')
        .map((name) => name[0])
        .join('')
        .toUpperCase();
      // Using a service like UI Avatars to generate an avatar based on initials
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(
        this.user.name
      )}&background=000000&color=ffffff&size=128`;
    }
    // Default fallback
    return 'https://ui-avatars.com/api/?name=User&background=000000&color=ffffff&size=128';
  }
}
