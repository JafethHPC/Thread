import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ConversationPaneComponent } from '../conversation-pane/conversation-pane.component';
import { ContextPanelComponent } from '../context-panel/context-panel.component';
import { SettingsComponent } from '../settings/settings.component';
import { ConversationService } from '../../services/conversation.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    ConversationPaneComponent,
    ContextPanelComponent,
    SettingsComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css'],
})
export class LayoutComponent implements OnInit {
  showSettings = false;
  sidebarCollapsed = false;

  constructor(
    private route: ActivatedRoute,
    private conversationService: ConversationService
  ) {}

  ngOnInit(): void {
    // Listen for route parameter changes to load specific conversations
    this.route.params.subscribe((params) => {
      const conversationId = params['id'];
      if (conversationId) {
        // Load the specific conversation
        this.conversationService
          .getConversation(parseInt(conversationId))
          .subscribe({
            error: (error) => {
              console.error('Error loading conversation:', error);
            },
          });
      } else {
        // No conversation ID, create new conversation
        this.conversationService.createConversation();
      }
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
