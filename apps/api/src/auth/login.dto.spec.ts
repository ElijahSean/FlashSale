import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_OPTIONS } from '../app.setup';
import { LoginDto } from './login.dto';

// The real global pipe with the production options, so this tests what a request goes through.
const pipe = new ValidationPipe(VALIDATION_OPTIONS);
const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: LoginDto }) as Promise<LoginDto>;

describe('LoginDto (rule 10: userId is normalized once, here)', () => {
  it('trims and lowercases the userId', async () => {
    expect(await validate({ userId: ' Eli@X.com ' })).toEqual({ userId: 'eli@x.com' });
  });

  it('accepts 1 and 254 characters', async () => {
    expect((await validate({ userId: 'a' })).userId).toBe('a');
    expect((await validate({ userId: 'a'.repeat(254) })).userId).toHaveLength(254);
  });

  it.each([
    ['missing', {}],
    ['empty', { userId: '' }],
    ['only spaces', { userId: '   ' }],
    ['a number', { userId: 123 }],
    ['an array', { userId: ['alice'] }],
    ['an object', { userId: { name: 'alice' } }],
    ['255 characters', { userId: 'a'.repeat(255) }],
  ])('rejects a userId that is %s', async (_case, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('drops fields that are not in the DTO', async () => {
    expect(await validate({ userId: 'alice', admin: true })).toEqual({ userId: 'alice' });
  });
});
