import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Create base tables that the application expects
    await knex.schema.createTable('users', (table) => {
        table.uuid('id').primary()
        table.string('firstname').notNullable()
        table.string('lastname').notNullable()
        table.string('email').notNullable().unique()
        table.string('password').notNullable()
        table.string('role').notNullable().defaultTo('USER')
    })

    await knex.schema.createTable('accounts', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
        table.uuid('userid').notNullable().references('id').inTable('users')
        table.string('iban').notNullable()
        table.string('currency').notNullable().defaultTo('EUR')
        table.decimal('balance', 14, 2).notNullable().defaultTo(0)
    })

    await knex.schema.createTable('transactions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
        table.uuid('accountid').notNullable().references('id').inTable('accounts')
        table.decimal('amount', 14, 2).notNullable()
        table.string('type').notNullable()
        table.string('description')
        table.timestamp('date').defaultTo(knex.fn.now())
    })

    await knex.schema.createTable('chats', (table) => {
        table.increments('id').primary()
        table.text('message')
        table.timestamp('created_at').defaultTo(knex.fn.now())
    })
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('chats')
    await knex.schema.dropTableIfExists('transactions')
    await knex.schema.dropTableIfExists('accounts')
    await knex.schema.dropTableIfExists('users')
}

