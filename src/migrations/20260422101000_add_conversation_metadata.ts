import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('conversations', (table) => {
        table.string('title', 120).nullable()
        table.string('title_source', 20).nullable()
        table.timestamp('last_message_at').nullable()
    })

    await knex('conversations')
        .whereNull('title')
        .orWhere('title', '')
        .update({ title: 'Nuova conversazione' })

    await knex('conversations')
        .whereNull('title_source')
        .update({ title_source: 'auto' })

    await knex('conversations')
        .whereNull('last_message_at')
        .update({ last_message_at: knex.ref('updated_at') })

    await knex.schema.alterTable('conversations', (table) => {
        table.string('title', 120).notNullable().alter()
        table.string('title_source', 20).notNullable().alter()
        table.timestamp('last_message_at').notNullable().alter()
        table.index(['user_id', 'last_message_at'], 'idx_conversations_user_last_message_at')
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('conversations', (table) => {
        table.dropIndex(['user_id', 'last_message_at'], 'idx_conversations_user_last_message_at')
        table.dropColumn('last_message_at')
        table.dropColumn('title_source')
        table.dropColumn('title')
    })
}

