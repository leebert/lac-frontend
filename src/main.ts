import './style.css'
import type { AgentResponse, ChecklistItem, MessageRequest } from './types'

// API Configuration
const API_BASE_URL = 'http://localhost:8080'; // Update this to your backend URL

// State
let sessionId: string | null = null;

// DOM Elements
const chatHistory = document.getElementById('chat-history') as HTMLDivElement;
const todoList = document.getElementById('todo-list') as HTMLDivElement;
const tokenSummarization = document.getElementById('token-summarization') as HTMLDivElement;
const tokenLimit = document.getElementById('token-limit') as HTMLDivElement;
const errorContainer = document.getElementById('error-container') as HTMLDivElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const messageInput = document.getElementById('message-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const thinkingIndicator = document.createElement('div') as HTMLDivElement;
thinkingIndicator.classList.add('thinking-div');
thinkingIndicator.innerHTML = '<strong>Agent:</strong> 🤔';

// Event Listeners
sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleSendMessage();
  }
});

// Functions
async function handleSendMessage() {
  const message = messageInput.value.trim();
  
  if (!message) {
    showError('Please enter a message');
    return;
  }
  
  // Disable input while processing
  messageInput.disabled = true;
  sendButton.disabled = true;
  hideError();
  
  // Add user message to chat
  addMessageToChat('user', message);
  chatHistory.appendChild(thinkingIndicator);
  
  try {
    const response = await sendMessage(message);
    thinkingIndicator.remove();
    
    // Update session ID
    sessionId = response.sessionId;
    
    // Add agent response to chat
    addMessageToChat('assistant', response.agentMessage);
    
    // Update todo list if provided
    if (response.checklist) {
      updateTodoList(response.checklist);
    }
    
    // Update token usage
    updateTokenUsage(response.usage);
    
    // Clear input
    messageInput.value = '';
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Failed to send message');
  } finally {
    // Re-enable input
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

async function sendMessage(message: string): Promise<AgentResponse> {
  const requestBody: MessageRequest = {
    sessionId,
    message,
  };

  const response = await fetch(`${API_BASE_URL}/api/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

function addMessageToChat(role: 'user' | 'assistant', content: string) {
  const messageElement = document.createElement('div');
  messageElement.style.marginBottom = '10px';
  messageElement.innerHTML = `<strong>${role === 'user' ? 'You' : 'Agent'}:</strong> ${escapeHtml(content)}`;
  chatHistory.appendChild(messageElement);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateTodoList(checklist: ChecklistItem[]) {
  if (checklist.length === 0) {
    todoList.innerHTML = 'No checklist yet';
    return;
  }
  
  const categoryEmojis: Record<string, string> = {
    health: '🏥',
    finance: '💰',
    travel: '✈️',
    household: '🏠',
    work: '💼',
    personal: '👤'
  };

  const priorityColors: Record<string, string> = {
    high: '#ff4444',
    medium: '#ffaa44',
    low: '#44aa44'
  };
  
  todoList.innerHTML = '<ul style="list-style: none; padding: 0;">' + 
    checklist.map(item => {
      const emoji = categoryEmojis[item.category] || '📋';
      const color = priorityColors[item.priority] || '#666';
      const dueDate = item.dueDate ? ` (Due: ${item.dueDate})` : '';
      
      return `
        <li style="margin-bottom: 15px; padding: 10px; border-left: 3px solid ${color}; background: #f9f9f9;">
          <strong>${emoji} ${escapeHtml(item.title)}</strong>
          <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
            ${escapeHtml(item.description)}
          </div>
          <div style="font-size: 0.8em; margin-top: 5px;">
            <span style="color: ${color};">Priority: ${item.priority}</span>
            <span style="margin-left: 10px;">Category: ${item.category}</span>
            ${dueDate}
          </div>
        </li>
      `;
    }).join('') + 
    '</ul>';
}

function updateTokenUsage(usage: { remainingBeforeSummarization: number; remainingBeforeLimit: number }) {
  tokenSummarization.innerHTML = `${usage.remainingBeforeSummarization}% before summarization`;
  tokenLimit.innerHTML = `${usage.remainingBeforeLimit}% before limit`;
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorContainer.style.display = 'block';
}

function hideError() {
  errorContainer.style.display = 'none';
  errorMessage.textContent = '';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initial focus
messageInput.focus();
