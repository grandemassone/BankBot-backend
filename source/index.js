import Fastify from 'fastify'
import fastifyWebsocket from "@fastify/websocket";
const fastify = Fastify({
    logger: true
})
fastify.register(fastifyWebsocket)

fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
        socket.on('message', message => {
            console.log(message.toString())

            socket.send(/*Inserire risposta finita in stringa LLM*/)
        })
    })
})

// Run the server!
try {
    await fastify.listen({ port: 3000 })
} catch (err) {
    fastify.log.error(err)
    process.exit(1)
}