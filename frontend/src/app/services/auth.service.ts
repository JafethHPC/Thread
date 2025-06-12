import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, from } from 'rxjs';
import { tap, switchMap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User } from '../models/user.model';
import { StorageService, StoredAuthData } from './storage.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api/auth';
  private userSubject: BehaviorSubject<User | null>;
  public user$: Observable<User | null>;
  public isInitialized$ = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    private router: Router,
    private storageService: StorageService
  ) {
    this.userSubject = new BehaviorSubject<User | null>(null);
    this.user$ = this.userSubject.asObservable();
    this.loadUserFromStorage();
  }

  private loadUserFromStorage(): void {
    try {
      const userJson = localStorage.getItem('user');
      if (userJson) {
        const user: User = JSON.parse(userJson);
        if (user && user.accessToken) {
          // You might want to add a check here to see if the token is expired
          this.userSubject.next(user);
        }
      }
    } catch (e) {
      console.error('Could not load user from storage', e);
      localStorage.removeItem('user');
    }
  }

  public get userValue(): User | null {
    return this.userSubject.value;
  }

  reauthenticate(): Observable<User | null> {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      const user: User = JSON.parse(userJson);
      this.userSubject.next(user);
    }
    this.isInitialized$.next(true);
    return of(this.userSubject.value);
  }

  signUp(name: string, email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/signup`, { name, email, password });
  }

  signIn(
    email: string,
    password: string,
    rememberMe: boolean = false
  ): Observable<User> {
    return this.http
      .post<User>(
        `${this.apiUrl}/signin`,
        { email, password },
        { withCredentials: true }
      )
      .pipe(
        tap(async (user) => {
          this.userSubject.next(user);
          localStorage.setItem('user', JSON.stringify(user));

          if (user.accessToken) {
            localStorage.setItem('token', user.accessToken);
          }
        })
      );
  }

  async signOut(): Promise<void> {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    this.userSubject.next(null);
    this.router.navigate(['/']);
  }

  saveUser(user: any) {
    this.userSubject.next(user);
  }

  isAuthenticated(): boolean {
    return !!this.userValue;
  }

  getUser(): Observable<User | null> {
    return this.user$;
  }

  changePassword(passwordData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/change-password`, passwordData, {
      withCredentials: true,
    });
  }

  getGoogleStatus(): Observable<{ isConnected: boolean }> {
    return this.http.get<{ isConnected: boolean }>(
      'http://localhost:3000/api/google/status',
      { withCredentials: true }
    );
  }

  getGoogleProfile(): Observable<any> {
    return this.http
      .get(`${this.apiUrl}/google/profile`, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response.user) {
            // Update the current user data with the response from backend
            this.updateUserProfile(response.user);
          }
        })
      );
  }

  disconnectGoogle(): Observable<any> {
    return this.http
      .delete(`${this.apiUrl}/google/disconnect`, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response.user) {
            // Update the current user data with the response from backend
            this.updateUserProfile(response.user);
          }
        })
      );
  }

  updateUserProfile(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.userSubject.next(user);
    this.storageService.getAuthData().then((storedData) => {
      if (storedData) {
        const newData = { ...storedData, user };
        this.storageService.storeAuthData(newData);
      }
    });
  }

  // Clear persistent session
  async clearPersistentSession(): Promise<void> {
    // This function is no longer needed with session-based auth
  }
}
