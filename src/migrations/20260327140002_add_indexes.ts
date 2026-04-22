import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('conversations', (table) => {
        table.index('user_id', 'idx_conversations_user_id')
    })
    await knex.schema.alterTable('messages', (table) => {
        table.index('conversation_id', 'idx_messages_conversation_id')
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('messages', (table) => {
        table.dropIndex('conversation_id', 'idx_messages_conversation_id')
    })
    await knex.schema.alterTable('conversations', (table) => {
        table.dropIndex('user_id', 'idx_conversations_user_id')
    })
}

