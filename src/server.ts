import Fastify, {FastifyRequest} from 'fastify'
import fastifyWebsocket from "@fastify/websocket";
import {loginSchema, LoginSchema} from "./schemas/loginSchema";
import fastifyCookie from "@fastify/cookie";
import {serializerCompiler, validatorCompiler, ZodTypeProvider} from "fastify-type-provider-zod";
import {knexPlugin} from "./plugins/knex";
import {generateAccessToken, generateRefreshToken} from "./utils/auth";
import userRepositoryPlugin from "./repositories/userRepository";
import argon2 from "argon2";

const fastify = Fastify({
    logger: true
}).withTypeProvider<ZodTypeProvider>()

fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)

fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET,
    hook: 'onRequest', // Process cookies early in the lifecycle
});
fastify.register(fastifyWebsocket)
fastify.register(knexPlugin)
fastify.register(userRepositoryPlugin)

fastify.register(async function (fastify) {
    fastify.get('/', {websocket: true}, (socket, req: FastifyRequest) => {
        socket.on('message', async (message: string) => {
            try {
                await fastify.knex('chats').insert({
                    message: message.toString()
                })
            } catch (error) {
                console.log('Errore durante l\'inserimento del messaggio')
                console.log(error)
            }
        })
    })

    //Login validation when sending a request, according to the json schema
    fastify.post('/login', {schema: {body: loginSchema}}, async (req, reply) => {
        console.log(loginSchema)
        const {email, password} = req.body as LoginSchema
        const existingUser = await fastify.userRepository.findByEmail(email)

        if (!existingUser) {
            return reply.status(404).send({success: false, message: 'Utente non trovato'})
        }

        const isPasswordValid = await argon2.verify(existingUser.password, password)

        if (!isPasswordValid) {
            return reply.status(401).send({success: false, message: 'Password non valida'})
        }

        const accessToken = generateAccessToken(existingUser)
        const refreshToken = generateRefreshToken(existingUser)

        reply.setCookie('refreshToken', refreshToken, {
            signed: true,
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            sameSite: 'lax',
            path: '/',
            expires: new Date(Date.now() + 60 * 60 * 24 * 7) //7 days
        })

        reply.setCookie('accessToken', accessToken, {
            signed: true,
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60 //15 minutes
        })

        return {
            message: 'Login effettuato con successo'
        }
    })
})

async function start() {
    try {
        await fastify.listen({port: 3000})
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()