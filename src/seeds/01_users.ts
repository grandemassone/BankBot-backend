import { faker } from '@faker-js/faker';
import { Knex } from "knex";
import argon2 from "argon2";

export async function seed(knex: Knex) {
    // 1. First we cancel Transactions (because they depend on Accounts)
    await knex('transactions').del();

    // 2. Then we delete the Accounts (because they depend on the Users)
    await knex('accounts').del();

    // 3. Finally we can delete the Users (now they no longer have ties)
    await knex('users').del();

    const usersToInsert = [];
    const numberOfUsers = 100;

    for (let i = 0; i < numberOfUsers; i++) {
        //First name and lastname to generate an email with real name and surname
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();

        usersToInsert.push({
            id: faker.string.uuid(),
            email: faker.internet.email({ firstName, lastName }), // Email based on real name
            firstname: firstName,
            lastname: lastName,
            password: await argon2.hash("demodemo")
        });
    }

    // 3. Insert
    await knex('users').insert(usersToInsert);
    console.log(`Creati ${usersToInsert.length} utenti con cognome.`);
};