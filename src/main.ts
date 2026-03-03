import './style.css'

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

// Interfaces
interface AgentResponse {
  sessionId: string;
  agentMessage: string;
  checklist?: Array<{ task: string; completed: boolean }>;
  usage: {
    remainingBeforeSummarization: number;
    remainingBeforeLimit: number;
  };
}

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
  const response = await fetch(`${API_BASE_URL}/api/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      message,
    }),
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

function updateTodoList(checklist: Array<{ task: string; completed: boolean }>) {
  if (checklist.length === 0) {
    todoList.innerHTML = 'No checklist yet';
    return;
  }
  
  todoList.innerHTML = '<ul>' + checklist.map(item => 
    `<li>${escapeHtml(item.task)} ${item.completed ? '✓' : ''}</li>`
  ).join('') + '</ul>';
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
