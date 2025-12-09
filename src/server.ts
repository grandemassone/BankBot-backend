import Fastify, {FastifyInstance, FastifyPluginOptions, FastifyRequest} from 'fastify'
import fastifyWebsocket from "@fastify/websocket";
import knexConfig from "./knexfile";
import knex from "knex";
import fp from "fastify-plugin";

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

const knexPlugin = fp(knexPluginInternal)
const fastify = Fastify({
    logger: true
})
fastify.register(fastifyWebsocket)
fastify.register(knexPlugin)

fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket, req: FastifyRequest) => {
        socket.on('message', async (message : string) => {
            try {
                await fastify.knex('chats').insert({
                    message: message.toString()
                })
            } catch (error){
                console.log('Errore durante l\'inserimento del messaggio')
                console.log(error)
            }
        })
    })
})

async function start(){
    try {
        await fastify.listen({ port: 3000 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()