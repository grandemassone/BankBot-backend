import 'dotenv/config'
import Fastify, { FastifyRequest } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import { loginSchema, LoginSchema } from './schemas/loginSchema'
import fastifyCookie from '@fastify/cookie'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'
import { knexPlugin } from './plugins/knex'
import userRepositoryPlugin from './repositories/userRepository'
import argon2 from 'argon2'
import fastifyJwt from '@fastify/jwt'
import accountRepositoryPlugin from './repositories/accountRepository'
import transactionRepositoryPlugin from './repositories/transactionRepository'
import conversationRepositoryPlugin from './repositories/conversationRepository'
import messageRepositoryPlugin from './repositories/messageRepository'
import { User } from './types'
import { llmPlugin } from './plugins/llm'
import { mcpBankPlugin } from './plugins/mcp'
import { agentPlugin } from './plugins/agent'
import { SignupSchema, signupSchema } from './schemas/signupSchema'
import { v4 } from 'uuid'
import cors from '@fastify/cors'
import { parseClientEvent, ServerEvent } from './websocket/protocol'
import type { Message } from './types'
import { buildAutoConversationTitle, sanitizeManualConversationTitle } from './utils/conversationTitle'
import { getOwnedConversation } from './utils/conversationOwnership'
import { z } from 'zod'

const fastify = Fastify({
    logger: true,
    maxParamLength: 500,
}).withTypeProvider<ZodTypeProvider>()

fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)

fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET,
    hook: 'onRequest',
})

fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET as string,
})

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
methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
})

fastify.decorate('authenticate', async (request, reply) => {
    const tokenCookieName = 'accessToken'
    const token = request.cookies[tokenCookieName]

    if (!token) {
        return reply.status(401).send({
            message: 'Unauthorized: Access token cookie not found',
        })
    }

    const unsignedToken = request.unsignCookie(token)

    if (!unsignedToken.value) {
        return reply.status(401).send({
            message: 'Unauthorized: Access token cookie not found',
        })
    }

    try {
        const decoded = fastify.jwt.verify(unsignedToken.value)
        request.user = (decoded as User) || {}
    } catch {
        reply.status(401).send({
            message: 'Unauthorized: Invalid or expired token',
        })
    }
})

const messagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().datetime().optional(),
})

const titlePatchSchema = z.object({
    title: z.string().min(1).max(120),
})

fastify.register(async function (app) {
    function send(socket: import('ws').WebSocket, event: ServerEvent) {
        if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(event))
        }
    }

    app.get('/conversations', { onRequest: app.authenticate }, async (req) => {
        const user = req.user as User
        const conversations = await app.conversationRepository.listSummariesByUserId(user.id)

        return conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            preview: conversation.preview,
            updatedAt: new Date(conversation.updated_at).toISOString(),
        }))
    })

    app.post('/conversations', { onRequest: app.authenticate }, async (req, reply) => {
        const user = req.user as User
        const conversation = await app.conversationRepository.create(user.id)

        return reply.status(201).send({
            id: conversation.id,
            title: conversation.title,
            titleSource: conversation.title_source,
            createdAt: new Date(conversation.created_at).toISOString(),
            updatedAt: new Date(conversation.updated_at).toISOString(),
        })
    })

    app.get('/conversations/:id/messages', { onRequest: app.authenticate }, async (req, reply) => {
        const user = req.user as User
        const params = req.params as { id: string }
        const parsedQuery = messagesQuerySchema.safeParse(req.query)

        if (!parsedQuery.success) {
            return reply.status(400).send({ message: 'Query parameters non validi' })
        }

        const conversation = await getOwnedConversation(app.conversationRepository, params.id, user.id)
        if (!conversation) {
            return reply.status(404).send({ message: 'Conversazione non trovata' })
        }

        const page = await app.messageRepository.getHistory(params.id, parsedQuery.data)

        return {
            items: page.items.map((item) => ({
                id: item.id,
                role: item.role,
                content: item.content,
                createdAt: new Date(item.created_at).toISOString(),
            })),
            nextCursor: page.nextCursor,
        }
    })

    app.patch('/conversations/:id/title', { onRequest: app.authenticate }, async (req, reply) => {
        const user = req.user as User
        const params = req.params as { id: string }
        const parsedBody = titlePatchSchema.safeParse(req.body)

        if (!parsedBody.success) {
            return reply.status(400).send({ message: 'Titolo non valido' })
        }

        let title: string
        try {
            title = sanitizeManualConversationTitle(parsedBody.data.title)
        } catch {
            return reply.status(400).send({ message: 'Titolo non valido' })
        }

        const conversation = await app.conversationRepository.updateTitle(params.id, user.id, title)
        if (!conversation) {
            return reply.status(404).send({ message: 'Conversazione non trovata' })
        }

        return {
            id: conversation.id,
            title: conversation.title,
            titleSource: conversation.title_source,
            updatedAt: new Date(conversation.updated_at).toISOString(),
        }
    })

    app.get('/:accessToken', {
        websocket: true,
        onRequest: async (request, reply) => {
            const token = (request.params as { accessToken: string }).accessToken
            if (!token) {
                return reply.status(401).send({ message: 'Unauthorized: Access token not provided' })
            }
            try {
                const decoded = app.jwt.verify(token)
                request.user = decoded as User
            } catch {
                return reply.status(401).send({ message: 'Unauthorized: Invalid or expired token' })
            }
        },
    }, async (socket, req: FastifyRequest) => {
        const user = req.user as User

        try {
            const existing = await app.conversationRepository.findByUserId(user.id)
            if (existing.length > 0) {
                send(socket, { type: 'conversation_started', conversationId: existing[0].id })
            }
        } catch (err) {
            app.log.error({ err }, 'Error loading existing conversations')
        }

        socket.on('message', async (raw: Buffer | string) => {
            const rawStr = raw.toString()
            const event = parseClientEvent(rawStr)

            if (!event) {
                send(socket, { type: 'error', message: 'Formato messaggio non valido' })
                return
            }

            if (event.type === 'new_conversation') {
                try {
                    const conversation = await app.conversationRepository.create(user.id)
                    send(socket, { type: 'conversation_started', conversationId: conversation.id })
                } catch (err) {
                    app.log.error({ err }, 'Error creating new conversation')
                    send(socket, { type: 'error', message: 'Errore nella creazione della conversazione' })
                }
                return
            }

            const conversation = await getOwnedConversation(app.conversationRepository, event.conversationId, user.id)
            if (!conversation) {
                send(socket, { type: 'error', message: 'Conversazione non valida o non autorizzata' })
                return
            }

            try {
                await app.messageRepository.create({
                    conversationId: event.conversationId,
                    role: 'user',
                    content: event.content,
                })

                await app.conversationRepository.setAutoTitleIfMissing(
                    event.conversationId,
                    buildAutoConversationTitle(event.content)
                )

                const dbHistory = await app.messageRepository.getHistory(event.conversationId, { limit: 50 })
                const agentHistory: Message[] = dbHistory.items
                    .filter((message) => message.role === 'user' || message.role === 'assistant')
                    .map((message) => ({ role: message.role, content: message.content || '' }))
                agentHistory.pop()

                send(socket, { type: 'typing', active: true })

                const response = await app.runAgent(event.content, agentHistory, {
                    id: user.id,
                    role: user.role,
                }, (toolName: string, result: string) => {
                    send(socket, { type: 'tool_call', toolName, result })
                })

                await app.messageRepository.create({
                    conversationId: event.conversationId,
                    role: 'assistant',
                    content: response,
                })

                await app.conversationRepository.touch(event.conversationId)

                send(socket, { type: 'message', role: 'assistant', content: response })
                send(socket, { type: 'typing', active: false })
            } catch (err) {
                app.log.error({ err }, 'Error processing message')
                send(socket, { type: 'typing', active: false })
                send(socket, { type: 'error', message: "Si e' verificato un errore nell'elaborazione del messaggio" })
            }
        })
    })

    app.post('/login', { schema: { body: loginSchema } }, async (req, reply) => {
        const { email, password } = req.body as LoginSchema
        const existingUser = await app.userRepository.findByEmail(email)

        if (!existingUser) {
            return reply.status(404).send({ success: false, message: 'Utente non trovato' })
        }

        const isPasswordValid = await argon2.verify(existingUser.password, password)

        if (!isPasswordValid) {
            return reply.status(401).send({ success: false, message: 'Password non valida' })
        }

        const existingUserWithoutPassword = {
            id: existingUser.id,
            email: existingUser.email,
            role: existingUser.role,
        }

        const accessToken = app.jwt.sign(existingUserWithoutPassword)
        const refreshToken = app.jwt.sign(existingUserWithoutPassword)

        reply.setCookie('refreshToken', refreshToken, {
            signed: true,
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            expires: new Date(Date.now() + 60 * 60 * 24 * 7),
        })

        reply.setCookie('accessToken', accessToken, {
            signed: true,
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60,
        })

        return {
            message: 'Login effettuato con successo',
        }
    })

    app.get('/me', { onRequest: app.authenticate }, async (req) => {
        return { user: req.user }
    })

    app.get('/ws-token', { onRequest: app.authenticate }, async (req) => {
        const user = req.user as User
        const wsToken = app.jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            { expiresIn: '2m' }
        )
        return { token: wsToken }
    })

    app.post('/logout', async (_req, reply) => {
        const cookieOptions = {
            path: '/',
            secure: false,
            sameSite: 'lax' as const,
            httpOnly: true,
        }

        reply.clearCookie('accessToken', cookieOptions)
        reply.clearCookie('refreshToken', cookieOptions)

        return reply.send({
            success: true,
            message: 'Logout effettuato con successo',
        })
    })

    app.post('/signup', { schema: { body: signupSchema } }, async (req, reply) => {
        const id = v4()
        const { firstname, lastname, email, password } = req.body as SignupSchema

        if (await app.userRepository.findByEmail(email)) {
            return reply.status(404).send({ success: false, message: 'Email gia esistente' })
        }

        const hashedPassword = await argon2.hash(password)
        await app.userRepository.createUser({
            id,
            firstname,
            lastname,
            email,
            password: hashedPassword,
            role: 'USER',
        })

        return { id }
    })
})

async function start() {
    try {
        await fastify.listen({ port: 3000 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()