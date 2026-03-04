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
const errorDismissButton = document.getElementById('error-dismiss-button') as HTMLButtonElement;
const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const thinkingIndicator = document.createElement('div') as HTMLDivElement;
thinkingIndicator.classList.add('chat-agent');
thinkingIndicator.innerHTML = '<span class="chat-agent-title">Agent</span>🤔';

// Event Listeners
sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});
errorDismissButton.addEventListener('click', hideError);

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
  thinkingIndicator.innerHTML = '<span class="chat-agent-title">Agent</span>🤔';
  chatHistory.appendChild(thinkingIndicator);
  
  try {
    const response = await sendMessageSSE(message, (mode: string) => {
      // Update thinking indicator with mode
      const modeLabels: Record<string, string> = {
        clarification: 'Clarifying',
        planning: 'Planning',
        refinement: 'Refining',
        error: 'Processing'
      };
      const modeLabel = modeLabels[mode] || 'Thinking';
      thinkingIndicator.innerHTML = `<span class="chat-agent-title">Agent</span>🤔 ${modeLabel}...`;
    });
    thinkingIndicator.remove();
    
    // Update session ID
    sessionId = response.sessionId;
    
    // Check if response contains an error (for test purposes)
    if (response.error) {
      // Show error in chat history instead of modal
      addMessageToChat('assistant', `⚠️ Error: ${response.error}`);
    } else {
      // Add agent response to chat
      addMessageToChat('assistant', response.agentMessage);
    }
    
    // Update todo list if provided
    if (response.checklist) {
      updateTodoList(response.checklist);
    }
    
    // Update token usage
    updateTokenUsage(response.usage);
    
    // Clear input
    messageInput.value = '';
  } catch (error) {
    thinkingIndicator.remove();
    showError(error instanceof Error ? error.message : 'Failed to send message');
  } finally {
    // Re-enable input
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

async function sendMessageSSE(message: string, onMode: (mode: string) => void): Promise<AgentResponse> {
  const requestBody: MessageRequest = {
    sessionId,
    message,
  };

  return new Promise((resolve, reject) => {
    fetch(`${API_BASE_URL}/api/message-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorData => {
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }).catch(() => {
          throw new Error(`HTTP ${response.status}`);
        });
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = (): Promise<void> => {
        return reader.read().then(({ done, value }) => {
          if (done) {
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const event = line.substring(7).trim();
              
              if (event === 'mode') {
                // Next line should be the data
                continue;
              } else if (event === 'response') {
                // Next line should be the data
                continue;
              } else if (event === 'error') {
                // Next line should be the error data
                continue;
              }
            } else if (line.startsWith('data: ')) {
              const data = line.substring(6);
              try {
                const parsed = JSON.parse(data);
                
                // Check what type of event this was
                if (parsed.mode) {
                  onMode(parsed.mode);
                } else if (parsed.sessionId) {
                  // This is the final response
                  resolve(parsed as AgentResponse);
                  return;
                } else if (parsed.error) {
                  reject(new Error(parsed.error));
                  return;
                }
              } catch (e) {
                // Ignore parse errors for empty lines
              }
            }
          }

          return processStream();
        });
      };

      return processStream();
    })
    .catch(error => {
      reject(error);
    });
  });
}

function addMessageToChat(role: 'user' | 'assistant', content: string) {
  const messageElement = document.createElement('div');
  messageElement.classList.add(role === 'user' ? 'chat-self' : 'chat-agent');
  messageElement.innerHTML = `${role === 'user' ? '' : '<span class="chat-agent-title">Agent</span>'}${escapeHtml(content)}`;
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
  
  todoList.innerHTML = '<ul>' + 
    checklist.map(item => {
      const emoji = categoryEmojis[item.category] || '📋';
      const color = priorityColors[item.priority] || '#666';
      const dueDate = item.dueDate ? ` Due: ${item.dueDate}` : '';
      
      return `
        <li>
          <h4>${emoji} ${escapeHtml(item.title)}</h4>
          <div>
            ${escapeHtml(item.description)}
          </div>
          <div>
            <span style="color: ${color};">Priority: ${item.priority}</span>
            <span>Category: ${item.category}</span>
            ${dueDate}
          </div>
        </li>
      `;
    }).join('') + 
    '</ul>';
}

function updateTokenUsage(usage: { 
  remainingBeforeSummarization: number; 
  remainingBeforeLimit: number;
  currentTokens: number;
  maxTokens: number;
  summarizationThreshold: number;
}) {
  tokenSummarization.innerHTML = `${usage.remainingBeforeSummarization}% before summarization (${usage.currentTokens.toLocaleString()}/${usage.summarizationThreshold.toLocaleString()} tokens)`;
  tokenLimit.innerHTML = `${usage.remainingBeforeLimit}% before limit (${usage.currentTokens.toLocaleString()}/${usage.maxTokens.toLocaleString()} tokens)`;
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorContainer.style.display = 'fixed';
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
