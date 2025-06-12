import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { User } from '../../models/user.model';
import { HttpClient } from '@angular/common/http';
import { ConversationService } from '../../services/conversation.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() onClose = new EventEmitter<void>();

  activeTab: 'account' | 'services' | 'privacy' = 'account';
  isGoogleConnected = false;
  isDisconnecting = false;
  disconnectMessage = '';
  private statusSubscription!: Subscription;
  isPasswordSectionVisible = false;

  user: User | null = null;
  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  tabs = [
    { id: 'account' as const, label: 'Account' },
    { id: 'services' as const, label: 'Services' },
  ];

  private googleAuthApiUrl = 'http://localhost:3000/api/google';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private conversationService: ConversationService
  ) {}

  ngOnInit(): void {
    this.checkGoogleStatus();
    this.loadUserData();
  }

  ngOnDestroy(): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }
  }

  loadUserData() {
    this.authService.getUser().subscribe((user) => {
      this.user = user;
    });
  }

  checkGoogleStatus(): void {
    this.http
      .get<{ isConnected: boolean }>(`${this.googleAuthApiUrl}/status`, {
        withCredentials: true,
      })
      .subscribe({
        next: (data) => {
          this.isGoogleConnected = data.isConnected;
        },
        error: (err) => {
          console.error('Error checking Google status:', err);
          this.isGoogleConnected = false;
        },
      });
  }

  connectGoogleAccount(): void {
    this.http
      .get<{ authUrl: string }>(`${this.googleAuthApiUrl}/auth`, {
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          const popup = window.open(
            response.authUrl,
            'GoogleAuth',
            'width=500,height=600,scrollbars=yes,resizable=yes'
          );

          if (!popup) {
            console.error('Failed to open popup window');
            return;
          }

          // Listen for popup messages
          const messageHandler = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data === 'google-auth-success') {
              console.log('Google account connected successfully');
              this.checkGoogleStatus();
              try {
                popup.close();
              } catch (e) {
                // Ignore CORS errors when closing popup
              }
              window.removeEventListener('message', messageHandler);
            } else if (event.data === 'google-auth-error') {
              console.error('Google connection failed');
              try {
                popup.close();
              } catch (e) {
                // Ignore CORS errors when closing popup
              }
              window.removeEventListener('message', messageHandler);
            }
          };

          window.addEventListener('message', messageHandler);

          // Clean up after a reasonable timeout
          setTimeout(() => {
            window.removeEventListener('message', messageHandler);
          }, 60000); // 1 minute timeout
        },
        error: (err) => {
          console.error('Failed to get Google auth URL:', err);
        },
      });
  }

  disconnectGoogle(): void {
    this.http
      .post(
        `${this.googleAuthApiUrl}/disconnect`,
        {},
        { withCredentials: true }
      )
      .subscribe({
        next: () => {
          this.isGoogleConnected = false;
          // Optionally, show a success message
        },
        error: (err) => {
          console.error('Error disconnecting Google account:', err);
          // Optionally, show an error message
        },
      });
  }

  togglePasswordSection() {
    this.isPasswordSectionVisible = !this.isPasswordSectionVisible;
  }

  changePassword() {
    if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
      console.error('New passwords do not match.');
      // Here you would typically show a user-facing error
      return;
    }
    // Call the auth service to change the password
    this.authService.changePassword(this.passwordData).subscribe({
      next: (response) => {
        console.log('Password changed successfully', response);
        // Reset form and notify user
        this.passwordData = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        };
      },
      error: (error) => {
        console.error('Error changing password', error);
        // Show user-facing error
      },
    });
  }

  async handleSignOut() {
    try {
      await this.authService.signOut();
      this.onClose.emit();
    } catch (error) {
      console.error('Error signing out:', error);
      // Fallback to regular signout
      this.onClose.emit();
    }
  }

  deleteAllConversations() {
    if (confirm('Delete all conversations? This action cannot be undone.')) {
      this.conversationService.deleteAllConversations().subscribe({
        next: () => alert('All conversations deleted.'),
        error: (err) => alert('Failed to delete conversations.'),
      });
    }
  }
}
