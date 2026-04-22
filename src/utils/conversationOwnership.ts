import { ConversationRepository, Conversation } from '../repositories/conversationRepository'

export async function getOwnedConversation(
    repository: ConversationRepository,
    conversationId: string,
    userId: string
): Promise<Conversation | null> {
    const conversation = await repository.findByIdForUser(conversationId, userId)
    return conversation ?? null
}

