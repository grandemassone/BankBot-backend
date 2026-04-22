import 'dotenv/config'
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
import conversationRepositoryPlugin from "./repositories/conversationRepository";
import messageRepositoryPlugin from "./repositories/messageRepository";
import {User} from "./types";
import {llmPlugin} from "./plugins/llm";
import {mcpBankPlugin} from "./plugins/mcp";
import {agentPlugin} from "./plugins/agent";
import {SignupSchema, signupSchema} from "./schemas/signupSchema";
import {v4} from "uuid";
import cors from "@fastify/cors"
import {parseClientEvent, ServerEvent} from "./websocket/protocol"
import type {Message} from "./types"

const fastify = Fastify({
    logger: true,
    maxParamLength: 500 // JWT tokens in WebSocket URL can be ~250 chars
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
fastify.register(conversationRepositoryPlugin)
fastify.register(messageRepositoryPlugin)
fastify.register(llmPlugin)
fastify.register(mcpBankPlugin)
fastify.register(agentPlugin)
fastify.register(cors, {
    origin: 'http://localhost:5173',
    credentials: true,
})

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

    // --- Helper to send a typed server event over WebSocket ---
    function send(socket: import('ws').WebSocket, event: ServerEvent) {
        if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(event))
        }
    }

    // --- WebSocket route: /:accessToken ---
    // Authentication via URL parameter: the JWT token is passed in the path.
    // We verify it in onRequest instead of using the cookie-based authenticate decorator,
    // because WebSocket connections can't easily send cookies.
    fastify.get('/:accessToken', {
        websocket: true,
        onRequest: async (request, reply) => {
            const token = (request.params as { accessToken: string }).accessToken
            if (!token) {
                return reply.status(401).send({ message: 'Unauthorized: Access token not provided' })
            }
            try {
                const decoded = fastify.jwt.verify(token)
                request.user = decoded as User
            } catch {
                return reply.status(401).send({ message: 'Unauthorized: Invalid or expired token' })
            }
        }
    }, async (socket, req: FastifyRequest) => {
        const user = req.user as User

        // --- Conversation lifecycle: find or create ---
        let conversationId: string
        try {
            const existing = await fastify.conversationRepository.findByUserId(user.id)
            if (existing.length > 0) {
                // Resume most recent conversation
                conversationId = existing[0].id
                send(socket, {type: 'conversation_started', conversationId})

                // Send history
                const history = await fastify.messageRepository.getHistory(conversationId)
                send(socket, {
                    type: 'history',
                    messages: history.map(m => ({role: m.role, content: m.content, created_at: m.created_at}))
                })
            } else {
                // First-time user: create new conversation
                const conv = await fastify.conversationRepository.create(user.id)
                conversationId = conv.id
                send(socket, {type: 'conversation_started', conversationId})
            }
        } catch (err) {
            fastify.log.error({err}, 'Error initializing conversation')
            send(socket, {type: 'error', message: 'Errore durante l\'inizializzazione della conversazione'})
            return
        }

        // --- Message handler ---
        socket.on('message', async (raw: Buffer | string) => {
            const rawStr = raw.toString()
            const event = parseClientEvent(rawStr)

            if (!event) {
                send(socket, {type: 'error', message: 'Formato messaggio non valido'})
                return
            }

            // --- Handle new_conversation ---
            if (event.type === 'new_conversation') {
                try {
                    const conv = await fastify.conversationRepository.create(user.id)
                    conversationId = conv.id
                    send(socket, {type: 'conversation_started', conversationId})
                } catch (err) {
                    fastify.log.error({err}, 'Error creating new conversation')
                    send(socket, {type: 'error', message: 'Errore nella creazione della conversazione'})
                }
                return
            }

            // --- Handle message ---
            if (event.type === 'message') {
                try {
                    // 1. Persist user message
                    await fastify.messageRepository.create({
                        conversationId,
                        role: 'user',
                        content: event.content
                    })

                    // 2. Load conversation history
                    const dbHistory = await fastify.messageRepository.getHistory(conversationId)
                    const agentHistory: Message[] = dbHistory
                        .filter(m => m.role === 'user' || m.role === 'assistant')
                        .map(m => ({role: m.role, content: m.content || ''}))
                    // Remove the last entry (the message we just persisted) — runAgent receives it as 'message' param
                    agentHistory.pop()

                    // 3. Send typing indicator
                    send(socket, {type: 'typing', active: true})

                    // 4. Call agent (emits tool_call events in real time)
                    const response = await fastify.runAgent(event.content, agentHistory, {
                        id: user.id,
                        role: user.role
                    }, (toolName, result) => {
                        send(socket, {type: 'tool_call', toolName, result})
                    })

                    // 5. Persist assistant response
                    await fastify.messageRepository.create({
                        conversationId,
                        role: 'assistant',
                        content: response
                    })

                    // 6. Update conversation timestamp
                    await fastify.conversationRepository.updateTimestamp(conversationId)

                    // 7. Send response + typing off
                    send(socket, {type: 'message', role: 'assistant', content: response})
                    send(socket, {type: 'typing', active: false})

                } catch (err) {
                    fastify.log.error({err}, 'Error processing message')
                    send(socket, {type: 'typing', active: false})
                    send(socket, {type: 'error', message: "Si è verificato un errore nell'elaborazione del messaggio"})
                }
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

    //Cookie da decodificare
    fastify.get('/me', { onRequest: fastify.authenticate }, async (req, reply) => {
        // req.user viene popolato dal decorator 'authenticate' decodificando il cookie

        return { user: req.user };
    });

    // Short-lived WebSocket token (HTTP-only cookies are inaccessible from JS)
    fastify.get('/ws-token', { onRequest: fastify.authenticate }, async (req, reply) => {
        const user = req.user as User
        const wsToken = fastify.jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            { expiresIn: '2m' }
        )
        return { token: wsToken }
    });

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
        console.log("Req: " + req)
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