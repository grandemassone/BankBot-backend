/*
import fp from "fastify-plugin";
import {FastifyInstance} from "fastify";

const promptPlugin = async (fastify: FastifyInstance) => {
    const user = await fastify.userRepository.findById(fastify.authenticatedUser.id)
    const accounts = await fastify.accountRepository.findByUserId(fastify.authenticatedUser.id)
    const prompt = {'generic': 'You are a helpful assistant.'}
    fastify.decorate('prompt', prompt)
}

export default fp(promptPlugin)
*/
