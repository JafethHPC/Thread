import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

interface Message {
  user: string;
  ai?: string;
}

@Component({
  selector: 'app-conversation-pane',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './conversation-pane.component.html',
  styleUrls: ['./conversation-pane.component.css'],
})
export class ConversationPaneComponent {
  messages: Message[] = [];
  newMessage: string = '';
  isLoading: boolean = false;
  isAuthenticated$: Observable<boolean>;
  private apiUrl = 'http://localhost:3000/api/ai/chat';
  private authUrl = 'http://localhost:3000/api/google/auth';

  constructor(private http: HttpClient, private authService: AuthService) {
    this.isAuthenticated$ = this.authService.user$.pipe(map((user) => !!user));
  }

  loginWithGoogle(): void {
    window.location.href = this.authUrl;
  }

  sendMessage(): void {
    if (!this.newMessage.trim()) return;

    const userMessage: Message = { user: this.newMessage };
    this.messages.push(userMessage);
    const tempMessage = this.newMessage;
    this.newMessage = '';
    this.isLoading = true;

    this.http
      .post<{ response: string }>(
        this.apiUrl,
        { message: tempMessage },
        { withCredentials: true }
      )
      .subscribe({
        next: (res) => {
          const lastMessage = this.messages[this.messages.length - 1];
          lastMessage.ai = res.response;
          this.isLoading = false;
        },
        error: (err) => {
          console.error('API Error:', err);
          const lastMessage = this.messages[this.messages.length - 1];
          lastMessage.ai = 'Sorry, something went wrong. Please try again.';
          this.isLoading = false;
        },
      });
  }
}
