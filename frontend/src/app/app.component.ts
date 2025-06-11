import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'frontend';

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.reauthenticate().subscribe({
      next: (user) => {
        // User is authenticated or null - both are valid states
      },
      error: (error) => {
        // 401 errors are expected when user is not logged in
        // Only log unexpected errors
        if (error.status !== 401) {
          console.error('Unexpected error during reauthentication:', error);
        }
      },
    });
  }
}
