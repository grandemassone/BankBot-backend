import { Knex } from 'knex'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { FALLBACK_TITLE } from '../utils/conversationTitle'

export type ConversationTitleSource = 'auto' | 'manual'

export interface Conversation {
    id: string
    user_id: string
    title: string
    title_source: ConversationTitleSource
    created_at: Date
    updated_at: Date
    last_message_at: Date
}

export interface ConversationSummary {
    id: string
    title: string
    preview: string | null
    updated_at: Date
}

export class ConversationRepository {
    constructor(private db: Knex) {}

    async create(userId: string): Promise<Conversation> {
        const [conversation] = await this.db('conversations')
            .insert({
                user_id: userId,
                title: FALLBACK_TITLE,
                title_source: 'auto',
                last_message_at: this.db.fn.now(),
            })
            .returning('*')
        return conversation
    }

    async findById(id: string): Promise<Conversation | undefined> {
        return this.db('conversations').where('id', id).first()
    }

    async findByIdForUser(id: string, userId: string): Promise<Conversation | undefined> {
        return this.db('conversations')
            .where({ id, user_id: userId })
            .first()
    }

    async findByUserId(userId: string): Promise<Conversation[]> {
        return this.db('conversations')
            .where('user_id', userId)
            .orderBy('last_message_at', 'desc')
    }

    async listSummariesByUserId(userId: string): Promise<ConversationSummary[]> {
        return this.db('conversations as c')
            .select(
                'c.id',
                'c.title',
                'c.last_message_at as updated_at',
                this.db.raw(`(
                    select m.content
                    from messages m
                    where m.conversation_id = c.id
                      and m.content is not null
                      and m.content <> ''
                    order by m.created_at desc
                    limit 1
                ) as preview`)
            )
            .where('c.user_id', userId)
            .orderBy('c.last_message_at', 'desc')
    }

    async touch(id: string): Promise<void> {
        await this.db('conversations')
            .where('id', id)
            .update({
                updated_at: this.db.fn.now(),
                last_message_at: this.db.fn.now(),
            })
    }

    async updateTitle(id: string, userId: string, title: string): Promise<Conversation | undefined> {
        const [conversation] = await this.db('conversations')
            .where({ id, user_id: userId })
            .update({
                title,
                title_source: 'manual',
                updated_at: this.db.fn.now(),
            })
            .returning('*')

        return conversation
    }

    async setAutoTitleIfMissing(id: string, title: string): Promise<void> {
        await this.db('conversations')
            .where({ id, title_source: 'auto' })
            .where((qb: Knex.QueryBuilder) => {
                qb.whereNull('title')
                    .orWhere('title', FALLBACK_TITLE)
                    .orWhere('title', '')
            })
            .update({
                title,
                updated_at: this.db.fn.now(),
            })
    }
}

const conversationRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const conversationRepository = new ConversationRepository(fastify.knex)
    fastify.decorate('conversationRepository', conversationRepository)
}

export default fp(conversationRepositoryPlugin, {
    name: 'conversationRepository',
    dependencies: ['knex']
})
