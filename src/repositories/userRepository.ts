import {Knex} from "knex";
import {FastifyInstance, FastifyPluginAsync} from "fastify";
import fp from "fastify-plugin";

interface User{
    id: string;
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    role: string;
}

class UserRepository {
    constructor(private db: Knex) {
        console.log("UserRepository inizializzato con Knex")
    }

    //Find a user by id
    findById(id: string): Promise<User | undefined> {
        return this.db('users').where('id', id).first()
    }

    //Find a user by mail
    findByEmail(email: string): Promise<User | undefined> {
        return this.db('users').where('email', email).first()
    }

    //Create user
    createUser(user: User): Promise<boolean> {
        return this.db('users').insert(user)
    }
}

const userRepositoryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const userRepository = new UserRepository(fastify.knex)
    fastify.decorate('userRepository', userRepository)
}

export default fp(userRepositoryPlugin, {name: 'userRepository', dependencies: ['knex']})