import {Knex} from "knex";
import {FastifyInstance, FastifyPluginAsync} from "fastify";
import fp from "fastify-plugin";

interface Account{
    id: string;
    userid: string;
}

class AccountRepository {
    constructor(private db: Knex) {
        console.log("AccountRepository inizializzato con Knex")
    }

    findById(id: string): Promise<Account | undefined> {
        return this.db('accounts').where('id', id).first()
    }

    findByUserId(userid: string): Promise<Account | undefined> {
        return this.db('accounts').where('userid', userid).first()
    }
}

const accountRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const accountRepository = new AccountRepository(fastify.knex)
    fastify.decorate('accountRepository', accountRepository)
}

export default fp(accountRepositoryPlugin, {dependencies: ['knex']})