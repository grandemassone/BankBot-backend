import fp from 'fastify-plugin'
import knex from 'knex'
import knexConfig from '../knexfile'
import {FastifyInstance, FastifyPluginCallback, FastifyPluginOptions} from "fastify";

function knexPlugin(fastify : FastifyInstance, options : FastifyPluginOptions, done) {
    if(!fastify.knex) {
        const knexIstance = knex(knexConfig)
        fastify.decorate('knex', knexIstance)

        fastify.addHook('onClose', (fastify, done) => {
            if (fastify.knex === knexIstance) {
                fastify.knex.destroy(done)
            }
        })

        fastify.addHook('onReady', (fastify, done) => {
            console.log(fastify.knex)
            done()
        })
    }

    done()
}

export default fp(knexPlugin, { name: 'knex' })