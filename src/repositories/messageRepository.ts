import { Knex } from 'knex'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

export interface ChatMessage {
    id: string
    conversation_id: string
    role: string
    content: string | null
    tool_call_id: string | null
    tool_name: string | null
    tool_args: Record<string, any> | null
    created_at: Date
}

export interface CreateMessageInput {
    conversationId: string
    role: string
    content: string
    toolCallId?: string
    toolName?: string
    toolArgs?: Record<string, any>
}

export interface GetHistoryOptions {
    limit?: number
    cursor?: string
}

export interface HistoryPage {
    items: ChatMessage[]
    nextCursor: string | null
}

export class MessageRepository {
    constructor(private db: Knex) {}

    async create(message: CreateMessageInput): Promise<ChatMessage> {
        const [row] = await this.db('messages')
            .insert({
                conversation_id: message.conversationId,
                role: message.role,
                content: message.content,
                tool_call_id: message.toolCallId || null,
                tool_name: message.toolName || null,
                tool_args: message.toolArgs ? JSON.stringify(message.toolArgs) : null,
            })
            .returning('*')
        return row
    }

    async getHistory(conversationId: string, options: GetHistoryOptions = {}): Promise<HistoryPage> {
        const requestedLimit = options.limit ?? 50
        const limit = Math.max(1, Math.min(requestedLimit, 100))

        const query = this.db('messages')
            .where('conversation_id', conversationId)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(limit + 1)

        if (options.cursor) {
            query.andWhere('created_at', '<', options.cursor)
        }

        const rows = await query
        const hasMore = rows.length > limit
        const pageRows = hasMore ? rows.slice(0, limit) : rows
        const nextCursor = hasMore
            ? new Date(pageRows[pageRows.length - 1].created_at).toISOString()
            : null

        return {
            items: pageRows.reverse(),
            nextCursor,
        }
    }
}

const messageRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const messageRepository = new MessageRepository(fastify.knex)
    fastify.decorate('messageRepository', messageRepository)
}

export default fp(messageRepositoryPlugin, {
    name: 'messageRepository',
    dependencies: ['knex']
})
