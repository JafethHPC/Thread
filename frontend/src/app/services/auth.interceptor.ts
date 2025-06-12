import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  try {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      const user = JSON.parse(userJson);
      if (user && user.accessToken) {
        const cloned = req.clone({
          setHeaders: {
            'x-access-token': user.accessToken,
          },
          withCredentials: true,
        });
        return next(cloned);
      }
    }
  } catch (e) {
    console.error('Could not parse user from storage for interceptor', e);
  }

  // Always include credentials, even when there's no access token
  const cloned = req.clone({
    withCredentials: true,
  });

  return next(cloned);
};
