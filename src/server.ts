import Fastify, {FastifyRequest} from 'fastify'
import fastifyWebsocket from "@fastify/websocket";
import {loginSchema, LoginSchema} from "./schemas/loginSchema";
import fastifyCookie from "@fastify/cookie";
import {serializerCompiler, validatorCompiler, ZodTypeProvider} from "fastify-type-provider-zod";
import {knexPlugin} from "./plugins/knex";
import userRepositoryPlugin from "./repositories/userRepository";
import argon2 from "argon2";
import fastifyJwt from "@fastify/jwt";
import accountRepositoryPlugin from "./repositories/accountRepository";
import transactionRepositoryPlugin from "./repositories/transactionRepository";
import {User} from "./types";
import {llmPlugin} from "./plugins/llm";
import {prompterPlugin} from "./plugins/prompter";
import {contextManagerPlugin} from "./plugins/contextManager";
import {SignupSchema, signupSchema} from "./schemas/signupSchema";
import * as repl from "node:repl";
import {v4} from "uuid";

const fastify = Fastify({
    logger: true
}).withTypeProvider<ZodTypeProvider>()

fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)

fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET,
    hook: 'onRequest', // Process cookies early in the lifecycle
});
fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET as string
});
fastify.register(fastifyWebsocket)
fastify.register(knexPlugin)
fastify.register(userRepositoryPlugin)
fastify.register(accountRepositoryPlugin)
fastify.register(transactionRepositoryPlugin)
fastify.register(llmPlugin)
fastify.register(prompterPlugin)
fastify.register(contextManagerPlugin)

fastify.decorate('authenticate', async (request, reply) => {
    // 1. Define the name of the cookie holding the token
    const tokenCookieName = 'accessToken';

    // 2. Retrieve the token from the cookies
    const token = request.cookies[tokenCookieName];

    if (!token) {
        // If the cookie is not present, respond with an error
        return reply.status(401).send({
            message: 'Unauthorized: Access token cookie not found'
        });
    }

    const unsignedToken = request.unsignCookie(token);

    if (!unsignedToken.value) {
        // If the cookie is not present, respond with an error
        return reply.status(401).send({
            message: 'Unauthorized: Access token cookie not found'
        });
    }

    try {
        // 3. Manually verify the retrieved token
        // The decoded payload is stored in `request.user` upon successful verification.
        const decoded = fastify.jwt.verify(unsignedToken.value)

        // Optionally, you can ensure the decoded payload is attached to the request:
        request.user = decoded as User || {}

    } catch (err) {
        // If verification fails (e.g., token invalid or expired)
        reply.status(401).send({
            message: 'Unauthorized: Invalid or expired token'
        });
    }
});

fastify.register(async function (fastify) {
    fastify.get('/:accessToken', {websocket: true, onRequest: fastify.authenticate}, (socket, req: FastifyRequest) => {
        const accessToken = (req.params as {accessToken: string}).accessToken
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
        const {email, password} = req.body as LoginSchema
        const existingUser = await fastify.userRepository.findByEmail(email)

        if (!existingUser) {
            return reply.status(404).send({success: false, message: 'Utente non trovato'})
        }

        const isPasswordValid = await argon2.verify(existingUser.password, password)

        if (!isPasswordValid) {
            return reply.status(401).send({success: false, message: 'Password non valida'})
        }

        //Utente senza password
        const existingUserWithoutPassword = {
            id: existingUser.id,
            email: existingUser.email,
            role: existingUser.role
        }

        const accessToken = fastify.jwt.sign(existingUserWithoutPassword)
        const refreshToken = fastify.jwt.sign(existingUserWithoutPassword)

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

    fastify.post('/logout', async (req, reply) => {
        const cookieOptions = {
            path: '/',
            secure: false, // Deve corrispondere a quanto settato nel login (true in prod)
            sameSite: 'lax' as const,
            httpOnly: true
        }

        // Istruisce il browser a rimuovere i cookie specifici
        reply.clearCookie('accessToken', cookieOptions)
        reply.clearCookie('refreshToken', cookieOptions)

        return reply.send({
            success: true,
            message: 'Logout effettuato con successo'
        })
    })

    fastify.post('/signup', {schema: {body: signupSchema}}, async (req, reply)=>{
        const id = v4() //Genera un id
        const { firstname, lastname, email, password } = req.body as SignupSchema

        if (await fastify.userRepository.findByEmail(email)) {
            return reply.status(404).send({success: false, message: 'Email già esistente'})
        }

        //Password cifrata
        const hashedPassword = await argon2.hash(password)

        await fastify.userRepository.createUser({id, firstname, lastname, email, password: hashedPassword, role: 'USER'})

        //I return id
        return {
            id
        }
    })

    fastify.get('/private', {onRequest: fastify.authenticate}, async (req, reply) => {
        if (!req.user) {
            return reply.status(401).send({success: false, message: 'Utente non autenticato'})
        }
        if (req.user.role !== 'USER' && req.user.role !== 'ADMIN') {
            return reply.status(401).send({success: false, message: 'Ruolo non valido'})
        }

        const actions = fastify.prompter[req.user.role]
        console.log(actions)
        if (!actions) {
            return reply.status(401).send({success: false, message: 'Ruolo non valido'})
        }

        //Richiesta azione
        const action = await fastify.askForAction("Vorrei i miei ultimi movimenti", actions)
        if (!action) {
            return reply.status(401).send({success: false, message: 'Azione non valida'})
        }

        console.log(action)

        //Recupero contesto
        const context = await fastify.contextManager[req.user.role][action](req.user.id)
        if (!context) {
            return reply.status(401).send({success: false, message: 'Contesto non valido'})
        }

        //Risposta finale
        const executeResponse = await fastify.executeAction(actions[action], context)
        if (!executeResponse) {
            return reply.status(401).send({success: false, message: 'Risposta non valida'})
        }

        return {
            message: 'Questo è un messaggio privato',
            action,
            context,
            executeResponse,
            user: req.user
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