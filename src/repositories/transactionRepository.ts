import {Knex} from "knex";
import {FastifyInstance, FastifyPluginAsync} from "fastify";
import fp from "fastify-plugin";
interface Transaction{
    id: string;
    accountid: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    description: string | null;
    date: Date;
}

interface CreateTransactionInput {
    accountid: string;
    amount: number;
    type: 'INCOME' | 'EXPENSE';
    description?: string;
}

class TransactionRepository {
    constructor(private db: Knex) {
        console.log("TransactionRepository inizializzato con Knex")
    }

    findById(id: string): Promise<Transaction | undefined> {
        return this.db('transactions').where('id', id).first()
    }

    findAllTransactionsByAccountId(accountid: string): Promise<Transaction[] | undefined> {
        return this.db('transactions').where('accountid', accountid).orderBy('date', 'desc')
    }

    async create(data: CreateTransactionInput): Promise<Transaction> {
        const [transaction] = await this.db('transactions').insert(data).returning('*')
        return transaction
    }
}

const transactionRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const transactionRepository = new TransactionRepository(fastify.knex)
    fastify.decorate('transactionRepository', transactionRepository)
}

export default fp(transactionRepositoryPlugin, {name: 'transactionRepository', dependencies: ['knex']})