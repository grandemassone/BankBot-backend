import fp from 'fastify-plugin'
import knex from 'knex'
import knexConfig from '../knexfile'
import {FastifyInstance, FastifyPluginOptions} from "fastify";

function knexPluginInternal(fastify : FastifyInstance, options : FastifyPluginOptions, done: (err?: Error) => void) {
    if(!fastify.knex) {
        const knexIstance = knex(knexConfig)
        fastify.decorate('knex', knexIstance)

        fastify.addHook('onClose', (instance: FastifyInstance, done: (err?: Error) => void) => {
            if (instance.knex === knexIstance) {
                instance.knex.destroy(done)
            }
        })
    }

    done()
}

export const knexPlugin = fp(knexPluginInternal, {name: 'knex'})