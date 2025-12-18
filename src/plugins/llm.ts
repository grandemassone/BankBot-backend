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

    const askForAction = async (prompt: string, actions: { [action: string]: string }) => {
        const response = await client.responses.create({
            model: 'gpt-5-nano',
            instructions: "Sei un assistente bancario incaricato di analizzare la richiesta  dell\'utente e decidere quale singola azione tecninca eseguire tra quelle disponibili",
            input: `Questo è il prompt dell'utente: ${prompt}. Queste sono le possibili azioni: ${JSON.stringify(actions)}. Tornami solo la stringa dell'azione scelta`,
        });
        return response.output_text
    }
    const executeAction = async (prompt: string, context: string) => {
        const response = await client.responses.create({
            model: 'gpt-5-nano',
            instructions: 'Sei un assistente bancario esperto e professionale. Fornisci supporto operativo a clienti e amministratori basandoti esclusivamente sui dati finanziari forniti nel contesto. Mantieni un tono formale, conciso e sicuro, evitando di inventare informazioni non presenti.',
            input: `Questo è il prompt dell'utente: ${prompt}. Questo è il contesto: ${context}`,
        });
        return response.output_text
    }

    fastify.decorate("askForAction", askForAction)
    fastify.decorate("executeAction", executeAction)

    done()
}

export const llmPlugin = fp(llmPluginInternal, {name: 'llm'})
