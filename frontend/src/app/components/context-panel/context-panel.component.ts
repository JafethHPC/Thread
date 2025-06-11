import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-context-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './context-panel.component.html',
  styleUrls: ['./context-panel.component.css'],
})
export class ContextPanelComponent {
  people = [
    {
      name: 'Sarah Chen',
      avatarUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
    },
    {
      name: 'John Martinez',
      avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    },
    {
      name: 'Anthony Miller',
      avatarUrl: 'https://randomuser.me/api/portraits/men/86.jpg',
    },
  ];

  timeline = [
    {
      time: 'Today, 9:15 AM',
      description: 'You asked about your next meeting',
      active: true,
    },
    {
      time: 'Yesterday, 4:23 PM',
      description: 'John sent email about Anthony',
      active: false,
    },
    {
      time: 'Yesterday, 2:15 PM',
      description: 'Sarah reported the bug',
      active: false,
    },
  ];

  constructor() {}
}
