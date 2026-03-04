/**
 * Shared types for Life Admin Copilot
 * These types match the backend JSON schemas
 */

export type Priority = "low" | "medium" | "high";

export type Category = "health" | "finance" | "travel" | "household" | "work" | "personal";

/**
 * Checklist item structure
 * Matches the backend PLANNING_SCHEMA
 */
export interface ChecklistItem {
  title: string;
  description: string;
  category: Category;
  dueDate: string | null;  // ISO date string YYYY-MM-DD or null
  priority: Priority;
  completed?: boolean;  // Frontend-only flag for UI state
}

/**
 * Response from the agent
 */
export interface AgentResponse {
  sessionId: string;
  agentMessage: string;
  checklist?: ChecklistItem[];
  error?: string;  // Error message for test purposes
  usage: {
    remainingBeforeSummarization: number;
    remainingBeforeLimit: number;
    currentTokens: number;
    maxTokens: number;
    summarizationThreshold: number;
  };
}

/**
 * Request to send a message
 */
export interface MessageRequest {
  sessionId: string | null;
  message: string;
}
