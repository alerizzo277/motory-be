import { applicationError } from '../common/graphql-errors.js';

// Preserve the existing upper bound; there are no composition requirements.
export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  isValid(value: unknown): value is string {
    return (
      typeof value === 'string' && value.length >= this.minLength && value.length <= this.maxLength
    );
  },
} as const;
export function validatePassword(value: unknown) {
  if (!PASSWORD_POLICY.isValid(value))
    throw applicationError(
      'VALIDATION_ERROR',
      `Password must contain ${PASSWORD_POLICY.minLength} to ${PASSWORD_POLICY.maxLength} characters.`,
    );
}
