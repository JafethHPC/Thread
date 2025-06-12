import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="task-list-container space-y-3">
      <h3 class="text-lg font-semibold mb-2">Your Tasks</h3>
      <div
        *ngFor="let task of tasks"
        class="task-item bg-gray-50 p-3 rounded-lg border border-gray-200"
      >
        <div class="flex justify-between items-start">
          <p class="font-semibold">{{ task.title }}</p>
          <span
            class="status-badge text-xs font-medium px-2 py-1 rounded-full"
            [ngClass]="{
              'bg-yellow-200 text-yellow-800': task.status === 'needsAction',
              'bg-green-200 text-green-800': task.status === 'completed'
            }"
          >
            {{ task.status === 'needsAction' ? 'In Progress' : 'Completed' }}
          </span>
        </div>
        <p *ngIf="task.dueDate" class="text-sm text-gray-500 mt-1">
          Due: {{ task.dueDate }}
        </p>
        <a
          [href]="task.link"
          target="_blank"
          class="text-sm text-blue-600 hover:underline mt-2 inline-block"
        >
          Open Task
        </a>
      </div>
    </div>
  `,
  styles: [
    `
      .status-badge {
        text-transform: capitalize;
      }
    `,
  ],
})
export class TaskListComponent {
  @Input() tasks: any[] = [];
}
