import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('messages', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
        table.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE')
        table.string('role', 20).notNullable()
        table.text('content')
        table.string('tool_call_id', 100).nullable()
        table.string('tool_name', 100).nullable()
        table.jsonb('tool_args').nullable()
        table.timestamp('created_at').defaultTo(knex.fn.now())
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('messages')
}

