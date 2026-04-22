import fp from 'fastify-plugin'
import {FastifyInstance, FastifyPluginOptions} from "fastify";
import {OpenAI} from "openai";

function llmPluginInternal(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
    if (!process.env["OPENAI_API_KEY"]) {
        throw new Error("OPENAI_API_KEY is not defined")
    }

    const client = new OpenAI({
        apiKey: process.env['OPENAI_API_KEY'],
    });

    fastify.decorate("openai", client)

    done()
}

export const llmPlugin = fp(llmPluginInternal, {name: 'llm'})
