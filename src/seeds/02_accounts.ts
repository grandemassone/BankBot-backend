import { faker } from '@faker-js/faker';
import { Knex } from "knex";

export async function seed(knex: Knex) {
    // 1. Retrieve existing users to link accounts
    const users = await knex('users').select('id');

    if (users.length === 0) {
        console.log("Nessun utente trovato! Esegui prima il seed degli utenti.");
        return;
    }

    const accountsToInsert = [];

    // 2. Generate an account for each user found
    for (const user of users) {
        accountsToInsert.push({
            id: faker.string.uuid(),
            userid: user.id,
            iban: faker.finance.iban({ countryCode: 'CH' }), // Genera IBAN Svizzero
            currency: faker.helpers.arrayElement(['CHF', 'EUR']),
            balance: parseFloat(faker.finance.amount({ min: 20, max: 5000000, dec: 2 })),
        });
    }

    // 3. Inserts data into the DB
    try {
        await knex('accounts').insert(accountsToInsert);
    }catch (error){
        console.log(error);
        throw error;
    }
}