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
  }
}
