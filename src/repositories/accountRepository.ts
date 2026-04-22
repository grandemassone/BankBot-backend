import {Knex} from "knex";
import {FastifyInstance, FastifyPluginAsync} from "fastify";
import fp from "fastify-plugin";

interface Account{
    id: string;
    userid: string;
    iban: string;
    currency: string;
    balance: number;
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

    async create(data: { userid: string; iban: string; currency: string }): Promise<Account> {
        const [account] = await this.db('accounts').insert(data).returning('*')
        return account
    }

    async updateBalance(id: string, delta: number): Promise<Account> {
        const [account] = await this.db('accounts')
            .where('id', id)
            .update({ balance: this.db.raw('balance + ?', [delta]) })
            .returning('*')
        return account
    }

    findAllWithUsers(): Promise<{ id: string; iban: string; currency: string; balance: number; firstname: string; lastname: string }[]> {
        return this.db('accounts')
            .join('users', 'accounts.userid', 'users.id')
            .select('accounts.id', 'accounts.iban', 'accounts.currency', 'accounts.balance', 'users.firstname', 'users.lastname')
    }
}

const accountRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const accountRepository = new AccountRepository(fastify.knex)
    fastify.decorate('accountRepository', accountRepository)
}

export default fp(accountRepositoryPlugin, {name: 'accountRepository',dependencies: ['knex']})