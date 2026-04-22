// --- Client → Server message types ---

export interface MessageEvent {
    type: 'message'
    conversationId: string
    content: string
}

export interface NewConversationEvent {
    type: 'new_conversation'
}

export type ClientEvent = MessageEvent | NewConversationEvent

// --- Server → Client message types ---

export interface AssistantMessageEvent {
    type: 'message'
    role: 'assistant'
    content: string
}

export interface TypingEvent {
    type: 'typing'
    active: boolean
}

export interface ErrorEvent {
    type: 'error'
    message: string
}

export interface ConversationStartedEvent {
    type: 'conversation_started'
    conversationId: string
}

export interface ToolCallEvent {
    type: 'tool_call'
    toolName: string
    result: string
}

export type ServerEvent =
    | AssistantMessageEvent
    | TypingEvent
    | ErrorEvent
    | ConversationStartedEvent
    | ToolCallEvent

// --- Validation helper ---

const VALID_CLIENT_TYPES = new Set(['message', 'new_conversation'])

export function parseClientEvent(raw: string): ClientEvent | null {
    try {
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || !VALID_CLIENT_TYPES.has(parsed.type)) {
            return null
        }
        if (
            parsed.type === 'message' &&
            (typeof parsed.content !== 'string' || typeof parsed.conversationId !== 'string')
        ) {
            return null
        }
        return parsed as ClientEvent
    } catch {
        return null
    }
}
