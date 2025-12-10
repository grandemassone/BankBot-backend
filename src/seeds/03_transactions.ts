import { faker } from '@faker-js/faker';
import { Knex } from "knex";

export async function seed(knex: Knex) {
    // 1. Recover existing accounts
    const accounts = await knex('accounts').select('id');

    if (accounts.length === 0) {
        console.log("Nessun conto trovato! Esegui prima il seed degli accounts.");
        return;
    }

    const transactionsToInsert = [];

    // 2. For each account, create between 5 and 15 random transactions
    for (const account of accounts) {
        const numberOfTransactions = faker.number.int({ min: 5, max: 15 });

        for (let i = 0; i < numberOfTransactions; i++) {
            // Decide casualmente se è una spesa (true) o un'entrata (false)
            const isExpense = faker.datatype.boolean();

            transactionsToInsert.push({
                id: faker.string.uuid(),
                accountid: account.id,
                // Genera importi diversi per entrate (più alte) e uscite
                amount: parseFloat(faker.finance.amount({
                    min: isExpense ? 5 : 1000,
                    max: isExpense ? 200 : 50000,
                    dec: 2
                })),
                date: faker.date.recent({ days: 90 }), // Transazioni degli ultimi 3 mesi
                description: isExpense
                    ? faker.company.name() // Nome azienda per le spese (es. "Uber")
                    : "Bonifico / Stipendio",
                type: isExpense ? 'EXPENSE' : 'INCOME'
            });
        }
    }

    // 4. Inserisce i dati a blocchi per efficienza
    try {
        await knex.batchInsert('transactions', transactionsToInsert, 100);
    }catch (error) {
        console.log(error);
        throw error;
    }
}