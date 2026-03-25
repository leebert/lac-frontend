import './style.css'
import { createLacAuth } from './auth.ts';
import type { AgentResponse, ChecklistItem, MessageRequest } from './types'

const API_ENDPOINT = `${import.meta.env.VITE_GOOLGE_CLOUD_URL}/api/message-stream`;
let sessionId: string | null = null;
let lacAuth: ReturnType<typeof createLacAuth> | null = null;

// Mobile responsive state
let checklistItemCount = 0;
let layoutMode: 'column' | 'modal' = 'column';
let checklistCollapsed = true;

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

// Mobile responsive elements
const checklistColumn = document.querySelector('.checklist-column') as HTMLDivElement;
const checklistHeader = document.querySelector('.checklist-header') as HTMLDivElement;
const checklistCount = document.getElementById('checklist-count') as HTMLSpanElement;
const floatingBtn = document.getElementById('floating-checklist-btn') as HTMLButtonElement;
const floatingCount = document.getElementById('floating-checklist-count') as HTMLSpanElement;
const checklistModal = document.getElementById('checklist-modal') as HTMLDivElement;
const checklistModalClose = document.getElementById('checklist-modal-close') as HTMLButtonElement;
const checklistModalBackdrop = document.querySelector('.checklist-modal-backdrop') as HTMLDivElement;
const checklistModalList = document.getElementById('checklist-modal-list') as HTMLDivElement;
const columnButton = document.getElementById('btn-column') as HTMLButtonElement;
const modalButton = document.getElementById('btn-modal') as HTMLButtonElement;

// Event Listeners
sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});
errorDismissButton.addEventListener('click', hideError);

// Mobile responsive event listeners
checklistHeader?.addEventListener('click', toggleChecklistCollapse);
floatingBtn?.addEventListener('click', openChecklistModal);
checklistModalClose?.addEventListener('click', closeChecklistModal);
checklistModalBackdrop?.addEventListener('click', closeChecklistModal);
columnButton.addEventListener('click', () => switchLayoutMode('column'));
modalButton.addEventListener('click', () => switchLayoutMode('modal'));

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
    
    // Surface all backend-returned errors in the modal
    if (response.error) {
      showError(response.error);
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

  const authToken = lacAuth?.getAuthToken();
  
  if (!authToken) {
    throw new Error('Not authenticated');
  }

  return new Promise((resolve, reject) => {
    fetch(`${API_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    })
    .then(response => {
      if (!response.ok) {
        // Handle 401 Unauthorized
        if (response.status === 401) {
          lacAuth?.handleUnauthorized();
          reject(new Error('Authentication required. Please log in again.'));
          return Promise.reject(new Error('Unauthorized'));
        }
        
        return response.json().then(errorData => {
          const backendError = errorData?.error;
          const errorMessage = typeof backendError === 'string'
            ? backendError
            : backendError?.message || errorData?.message || `HTTP ${response.status}`;

          throw new Error(errorMessage);
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
  setTimeout(()=>{
  chatHistory.scrollTo({
    top: chatHistory.scrollHeight,
    behavior: 'smooth'
  });
}, 150);
}

function updateTodoList(checklist: ChecklistItem[]) {
  checklistItemCount = checklist.length;
  
  // Update item count badges
  updateChecklistCounts();
  
  if (checklist.length === 0) {
    todoList.innerHTML = 'No checklist yet';
    if (checklistModalList) checklistModalList.innerHTML = 'No checklist yet';
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
  
  const listHtml = '<ul>' + 
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
  
  todoList.innerHTML = listHtml;
  if (checklistModalList) checklistModalList.innerHTML = listHtml;
}

function updateTokenUsage(usage: { 
  remainingBeforeSummarization: number; 
  remainingBeforeLimit: number;
  currentTokens: number;
  maxTokens: number;
  summarizationThreshold: number;
  summarizationCount: number;
}) {
  const summarizationInfo = usage.summarizationCount > 0 
    ? ` (Summarized ${usage.summarizationCount} time${usage.summarizationCount > 1 ? 's' : ''})`
    : '';
  
  tokenSummarization.innerHTML = `${usage.remainingBeforeSummarization}% before summarization (${usage.currentTokens.toLocaleString()}/${usage.summarizationThreshold.toLocaleString()} tokens)${summarizationInfo}`;
  tokenLimit.innerHTML = `${usage.remainingBeforeLimit}% before limit (${usage.currentTokens.toLocaleString()}/${usage.maxTokens.toLocaleString()} tokens)`;
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorContainer.style.display = 'flex';
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

// Mobile responsive functions
const MOBILE_BREAKPOINT = 750;

function isMobileViewport(): boolean {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function updateChecklistCounts() {
  const countText = checklistItemCount > 0 ? `(${checklistItemCount})` : '';
  if (checklistCount) checklistCount.textContent = countText;
  if (floatingCount) floatingCount.textContent = checklistItemCount.toString();
}

function toggleChecklistCollapse() {
  if (!checklistColumn) return;
  
  checklistCollapsed = !checklistCollapsed;
  
  if (checklistCollapsed) {
    checklistColumn.classList.add('collapsed');
  } else {
    checklistColumn.classList.remove('collapsed');
  }
}

function openChecklistModal() {
  if (checklistModal) {
    checklistModal.classList.add('visible');
  }
}

function closeChecklistModal() {
  if (checklistModal) {
    checklistModal.classList.remove('visible');
  }
}

function switchLayoutMode(mode: 'column' | 'modal') {
  layoutMode = mode;
  
  // Update body class
  document.body.classList.remove('mobile-column-mode', 'mobile-modal-mode');
  document.body.classList.add(`mobile-${mode}-mode`);
  
  // Update toggle buttons
  if(mode === 'column') {
    columnButton.classList.add('inactive');
    modalButton.classList.remove('inactive');

  }
  else {
    columnButton.classList.remove('inactive');
    modalButton.classList.add('inactive');
  }
}

function handleViewportResize() {
  if (isMobileViewport()) {
    switchLayoutMode(layoutMode);
  } else {
    document.body.classList.remove('mobile-column-mode', 'mobile-modal-mode');
    closeChecklistModal();
  }
}

// Initialize the app after authentication
function initializeApp() {
  console.log('• Lac Prototype Initialized:');
  console.log('• Endpoint:', API_ENDPOINT);
  messageInput.focus();
  
  addMessageToChat('assistant', '👋 Hello, I\'m LAC. I can help you plan logistical tasks like registering to vote or moving to a new place.');

  handleViewportResize();
  
  // Handle viewport resize
  window.addEventListener('resize', handleViewportResize);
}

lacAuth = createLacAuth(initializeApp);
lacAuth.initialize();
