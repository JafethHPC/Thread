export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: any;
  type: 'text' | 'emails' | 'tasks' | 'calendar_events' | 'error';
  createdAt?: string;
  conversationId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}
