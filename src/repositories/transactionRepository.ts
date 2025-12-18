import {Knex} from "knex";
import {FastifyInstance, FastifyPluginAsync} from "fastify";
import fp from "fastify-plugin";
import transactionRepository from "./transactionRepository";

interface Transaction{
    id: string;
    accountid: string;
}

class TransactionRepository {
    constructor(private db: Knex) {
        console.log("TransactionRepository inizializzato con Knex")
    }

    findById(id: string): Promise<Transaction | undefined> {
        return this.db('transactions').where('id', id).first()
    }

    findAllTransactionsByAccountId(accountid: string): Promise<Transaction[] | undefined> {
        return this.db('transactions').where('accountid', accountid)
    }
}

const transactionRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const transactionRepository = new TransactionRepository(fastify.knex)
    fastify.decorate('transactionRepository', transactionRepository)
}

export default fp(transactionRepositoryPlugin, {name: 'transactionRepository', dependencies: ['knex']})