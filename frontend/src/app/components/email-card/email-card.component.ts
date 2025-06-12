import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-email-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="email-card-container bg-gray-50 p-4 rounded-lg border border-gray-200 cursor-pointer transition-all hover:border-gray-300"
      (click)="toggleExpand()"
    >
      <div class="email-header flex items-center justify-between mb-2">
        <h4 class="font-semibold text-gray-800">{{ email.subject }}</h4>
        <span class="text-sm text-gray-600 flex-shrink-0 pl-4">{{
          email.from
        }}</span>
      </div>
      <div class="email-body">
        <p *ngIf="!isExpanded" class="text-gray-700 truncate">
          {{ email.body }}
        </p>
        <div
          *ngIf="isExpanded"
          class="prose prose-sm max-w-none mt-4"
          [innerHTML]="sanitizedFullBody"
        ></div>
      </div>
      <div class="email-footer mt-3 flex justify-between items-center">
        <a
          *ngIf="email.email"
          href="mailto:{{ email.email }}"
          class="text-sm text-blue-600 hover:underline"
          (click)="$event.stopPropagation()"
          >Reply</a
        >
        <span class="text-xs text-gray-400">
          {{ isExpanded ? 'Click to collapse' : 'Click to expand' }}
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      .prose {
        /* Basic prose styling for rendered HTML */
        color: #374151;
      }
      .prose h1,
      .prose h2,
      .prose h3 {
        margin-bottom: 0.5em;
      }
      .prose p {
        margin-bottom: 1em;
      }
      .prose a {
        color: #2563eb;
      }
      .prose blockquote {
        margin-top: 1.5rem;
        background-color: #f9fafb; /* gray-50 */
        border-left-width: 4px;
        border-left-color: #d1d5db; /* gray-300 */
        padding: 1rem;
        font-style: normal;
        color: #4b5563; /* gray-600 */
        border-radius: 0.25rem;
      }
    `,
  ],
})
export class EmailCardComponent implements OnChanges {
  @Input() email: any = {};
  isExpanded = false;
  sanitizedFullBody!: SafeHtml;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['email'] && this.email && this.email.fullBody) {
      this.sanitizedFullBody = this.sanitizer.bypassSecurityTrustHtml(
        this.email.fullBody
      );
    }
  }

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
  }
}
