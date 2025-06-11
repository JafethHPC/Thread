import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css',
})
export class LandingComponent {
  stats = [
    { number: '10K+', label: 'Active Users' },
    { number: '1M+', label: 'Messages Processed' },
    { number: '99.9%', label: 'Uptime' },
    { number: '4.9/5', label: 'User Rating' },
  ];

  features = [
    {
      number: '01',
      title: 'CONVERSATIONAL',
      description:
        'Manage your digital life through natural language. Ask questions, get instant answers, and take action with simple commands.',
    },
    {
      number: '02',
      title: 'CONTEXTUAL',
      description:
        'Get relevant information about people, meetings, and tasks automatically surfaced based on your conversation context.',
    },
    {
      number: '03',
      title: 'SECURE',
      description:
        'Your data remains secure and private. Thread processes information locally and never shares your personal data.',
    },
  ];
}
