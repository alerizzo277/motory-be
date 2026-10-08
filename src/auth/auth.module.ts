import { PrismaModule } from '../prisma/prisma.module.js';
import { MailModule } from '../mail/mail.module.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './auth.service.js';
import { AuthResolver } from './auth.resolver.js';
import { JwtStrategy } from './jwt.strategy.js';
import { GqlAuthGuard } from './guards/gql-auth.guard.js';
@Module({
  imports: [
    UsersModule,
    PrismaModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        const duration = config.getOrThrow<string>('JWT_EXPIRES_IN');
        if (secret.trim().length < 32)
          throw new Error('JWT_SECRET must contain at least 32 characters');
        if (
          !/^[1-9]\d*$/.test(duration) ||
          !Number.isSafeInteger(Number(duration))
        ) {
          throw new Error(
            'JWT_EXPIRES_IN must be a positive integer in seconds',
          );
        }
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: Number(duration) },
        };
      },
    }),
  ],
  providers: [AuthService, AuthResolver, JwtStrategy, GqlAuthGuard],
  exports: [GqlAuthGuard],
})
export class AuthModule {}
