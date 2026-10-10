import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isUUID } from 'class-validator';
import { applicationError } from '../common/graphql-errors.js';
import type { AuthenticatedUser } from './auth.types.js';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ConfigService) config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }
  validate(payload: { sub?: unknown; role?: unknown; exp?: unknown }): AuthenticatedUser {
    if (
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub) ||
      typeof payload.role !== 'string' ||
      !payload.role.trim() ||
      typeof payload.exp !== 'number'
    ) {
      throw applicationError('UNAUTHENTICATED', 'Authentication required.');
    }
    return { id: payload.sub, role: payload.role };
  }
}
