import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConversationPaneComponent } from './conversation-pane.component';

describe('ConversationPaneComponent', () => {
  let component: ConversationPaneComponent;
  let fixture: ComponentFixture<ConversationPaneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConversationPaneComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ConversationPaneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
