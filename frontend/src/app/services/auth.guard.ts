import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { of } from 'rxjs';
import { switchMap, take, filter } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isInitialized$.pipe(
    filter((isInitialized) => isInitialized),
    take(1),
    switchMap(() => {
      if (authService.isAuthenticated()) {
        return of(true);
      } else {
        router.navigate(['/auth']);
        return of(false);
      }
    })
  );
};
