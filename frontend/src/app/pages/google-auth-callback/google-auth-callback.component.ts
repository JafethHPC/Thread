import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-google-auth-callback',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div
          class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
        ></div>
        <p>Connecting your Google account...</p>
      </div>
    </div>
  `,
})
export class GoogleAuthCallbackComponent implements OnInit {
  private apiUrl = environment.apiUrl;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      const error = params['error'];

      if (error) {
        console.error('Google OAuth error:', error);
        this.handleError('Google authorization failed');
        return;
      }

      if (!code) {
        console.error('No authorization code received');
        this.handleError('No authorization code received');
        return;
      }

      // Exchange code for tokens
      this.http
        .post(
          `${this.apiUrl}/google/exchange-code`,
          { code },
          { withCredentials: true }
        )
        .subscribe({
          next: (response: any) => {
            console.log('Google account connected:', response);
            this.handleSuccess();
          },
          error: (error) => {
            console.error('Failed to connect Google account:', error);
            this.handleError('Failed to connect Google account');
          },
        });
    });
  }

  private handleSuccess(): void {
    if (window.opener) {
      // We're in a popup
      window.opener.postMessage('google-auth-success', window.location.origin);
      window.close();
    } else {
      // Redirect to dashboard
      this.router.navigate(['/dashboard']);
    }
  }

  private handleError(message: string): void {
    if (window.opener) {
      // We're in a popup
      window.opener.postMessage('google-auth-error', window.location.origin);
      window.close();
    } else {
      // Redirect to dashboard with error
      this.router.navigate(['/dashboard'], { queryParams: { error: message } });
    }
  }
}
