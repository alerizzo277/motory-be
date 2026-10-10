import { PASSWORD_POLICY, validatePassword } from './password-policy.js';

it.each(['abcdefgh', '        ', ' Mixed\nCase! ', 'x'.repeat(128)])(
  'accepts length-only passwords without normalization',
  (password) => {
    expect(PASSWORD_POLICY.isValid(password)).toBe(true);
    expect(() => validatePassword(password)).not.toThrow();
  },
);
it.each(['', '1234567', 'x'.repeat(129), null, undefined, 12345678])(
  'rejects invalid policy inputs',
  (password) => {
    expect(PASSWORD_POLICY.isValid(password)).toBe(false);
    expect(() => validatePassword(password)).toThrow(
      expect.objectContaining({ extensions: { code: 'VALIDATION_ERROR' } }),
    );
  },
);
