import { APP_FILTER } from '@nestjs/core';
import { GraphqlExceptionFilter } from './common/graphql-exception.filter.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { AppResolver } from './app.resolver.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { MailModule } from './mail/mail.module.js';
import { AuthModule } from './auth/auth.module.js';
import { formatGraphqlError } from './common/graphql-errors.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    MailModule,
    AuthModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      includeStacktraceInErrorResponses: false,
      formatError: formatGraphqlError,
    }),
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver, { provide: APP_FILTER, useClass: GraphqlExceptionFilter }],
})
export class AppModule {}
