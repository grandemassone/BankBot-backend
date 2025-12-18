import { Knex } from 'knex';
import {UserRepository} from './repositories/userRepository';
import AccountRepository from "./repositories/accountRepository";
import TransactionRepository from "./repositories/transactionRepository";

declare module 'fastify' {
  export interface FastifyInstance {
    knex: Knex;
    userRepository: UserRepository;
    accountRepository: AccountRepository;
    transactionRepository: TransactionRepository;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => void;
    fastifyJwt: FastifyJWT;
    prompter: {
      "USER": {
        [action: string]: string;
      };
      "ADMIN": {
        [action: string]: string;
      };
    };
    askForAction: (prompt: string, actions: { [action: string]: string }) => Promise<string>;
    executeAction: (prompt: string, context: string) => Promise<string>;
    contextManager: {
      "USER": {
        [action: string]: (userID: string) => Promise<string>;
      };
      "ADMIN": {
        [action: string]: (userID: string) => Promise<string>;
      };
    };
  }
  export interface FastifyRequest {
    user: User;
  }
}

export interface User {
  id: string;
  email: string;
  role: string;
  iat: number;
}