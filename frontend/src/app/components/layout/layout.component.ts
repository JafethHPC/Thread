import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ConversationPaneComponent } from '../conversation-pane/conversation-pane.component';
import { ContextPanelComponent } from '../context-panel/context-panel.component';
import { SettingsComponent } from '../settings/settings.component';

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
export class LayoutComponent {
  showSettings = false;
  sidebarCollapsed = false;

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
