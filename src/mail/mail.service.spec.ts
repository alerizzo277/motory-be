import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';

const { send, constructor } = vi.hoisted(() => ({
  send: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
    constructor(key: string) {
      constructor(key);
    }
  },
}));

describe('MailService', () => {
  const options = {
    to: 'test@example.com',
    subject: 'Test',
    html: '<p>Test</p>',
  };
  let service: MailService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MailService(
      new ConfigService({
        RESEND_API_KEY: 'test-api-key',
        MAIL_FROM: 'sender@example.com',
      }),
    );
  });

  it('uses configured credentials and sender and returns the accepted email id', async () => {
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null });
    await expect(service.sendEmail(options)).resolves.toEqual({
      id: 'email-id',
    });
    expect(constructor).toHaveBeenCalledWith('test-api-key');
    expect(send).toHaveBeenCalledWith({
      ...options,
      from: 'sender@example.com',
    });
  });

  it.each([
    { data: null, error: { message: 'Rejected', name: 'validation_error' } },
    { data: null, error: null },
  ])('converts unsuccessful provider responses into Nest exceptions', async (response) => {
    send.mockResolvedValue(response);
    await expect(service.sendEmail(options)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('converts network failures into Nest exceptions', async () => {
    send.mockRejectedValue(new Error('Network unavailable'));
    await expect(service.sendEmail(options)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fails on missing configuration', () => {
    const config = new ConfigService();
    vi.spyOn(config, 'getOrThrow').mockImplementation(() => {
      throw new Error('Missing configuration');
    });
    expect(() => new MailService(config)).toThrow('Missing configuration');
  });
  it('renders Motory verification email with configured URL and dynamic TTL', async () => {
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null });
    await service.sendVerificationEmail(
      'alice@example.com',
      'https://motory.example/verify-email?token=abc&other=1',
      1440,
    );
    const options = send.mock.calls[0][0] as { html: string };
    expect(options.html).toContain('Conferma il tuo indirizzo email');
    expect(options.html).toContain('24 ore');
    expect(options.html).toContain('https://motory.example/verify-email?token=abc&amp;other=1');
    expect(options.html).not.toContain('<img');
    expect(options.html).not.toContain('localhost');
  });
  it('renders password reset with TTL in minutes and ignore notice', async () => {
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null });
    await service.sendPasswordResetEmail(
      'alice@example.com',
      'https://motory.example/reset-password?token=abc',
      60,
    );
    const options = send.mock.calls[0][0] as { html: string };
    expect(options.html).toContain('60 minuti');
    expect(options.html).toContain('puoi ignorare questa email');
    expect(options.html).toContain('Reimposta password');
  });
});
