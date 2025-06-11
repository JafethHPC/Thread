import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css'],
})
export class AuthComponent implements OnInit {
  isSignUp = false;
  showPassword = false;
  authForm!: FormGroup;
  errorMessage?: string;
  successMessage?: string;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm() {
    this.authForm = this.fb.group({
      name: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      confirmPassword: [''],
      rememberMe: [false],
    });

    if (this.isSignUp) {
      this.authForm.get('name')?.setValidators([Validators.required]);
      this.authForm
        .get('confirmPassword')
        ?.setValidators([Validators.required]);
    } else {
      this.authForm.get('name')?.clearValidators();
      this.authForm.get('confirmPassword')?.clearValidators();
    }
    this.authForm.get('name')?.updateValueAndValidity();
    this.authForm.get('confirmPassword')?.updateValueAndValidity();
  }

  toggleAuthMode() {
    this.isSignUp = !this.isSignUp;
    this.errorMessage = undefined;
    this.successMessage = undefined;
    this.initForm();
  }

  handleSubmit() {
    if (this.authForm.invalid) {
      return;
    }

    const { name, email, password, rememberMe } = this.authForm.value;

    if (this.isSignUp) {
      this.authService.signUp(name, email, password).subscribe({
        next: () => {
          this.successMessage =
            'Account created successfully! You can now sign in.';
          this.isSignUp = false;
          this.initForm();
        },
        error: (err) => {
          this.errorMessage = err.error.message;
        },
      });
    } else {
      this.authService.signIn(email, password, rememberMe).subscribe({
        next: () => {
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.errorMessage = err.error.message;
        },
      });
    }
  }
}
