import fp from 'fastify-plugin'
import {FastifyInstance, FastifyPluginOptions} from "fastify";

function contextManagerPluginInternal(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
    const contextManager = {
        "USER": {
            "BALANCE": async (userID: string)=>{
                const account = await fastify.accountRepository.findByUserId(userID)
                return JSON.stringify(account)
            },

            "LAST_TRANSACTIONS": async (userID: string)=>{
                const account = await fastify.accountRepository.findByUserId(userID)
                const transactions = await fastify.transactionRepository.findAllTransactionsByAccountId(account.id)
                return JSON.stringify(transactions)
            },

            "CHANGE": async (userID: string)=>{
                const account = await fastify.accountRepository.findByUserId(userID)
                return JSON.stringify(account)
            },

            "INFO_ACCOUNT": async (userID: string)=>{
                const account = await fastify.accountRepository.findByUserId(userID)
                return JSON.stringify(account)
            }},

        "ADMIN": {
            "RISK": async (userID: string)=>{
                const account = await fastify.accountRepository.findByUserId(userID)
                const transactions = await fastify.transactionRepository.findAllTransactionsByAccountId(account.id)
                return JSON.stringify(transactions)
            }
        }
    }
    fastify.decorate("contextManager", contextManager)
    done()
}

export const contextManagerPlugin = fp(contextManagerPluginInternal, {name: 'contextManager', dependencies: ["userRepository", "accountRepository", "transactionRepository"]})
