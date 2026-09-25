import { useState, type FormEvent } from 'react';
import { demoLogin } from '../api';
import { LOGIN_ERRORS } from '../messages';
import { Spinner } from './Spinner';

export interface Session {
  accessToken: string;
  userId: string;
}

// Same limit as the API's LoginDto, so the common mistake is caught without a round trip.
const MAX_LENGTH = 254;

export function SignInForm({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Only checks for empty and length. Lowercasing is the API's job (design rule 10): one place
    // decides what a userId is, and the name shown afterwards is the one the token carries.
    const trimmed = value.trim();
    const problem = !trimmed
      ? LOGIN_ERRORS.EMPTY
      : trimmed.length > MAX_LENGTH
        ? LOGIN_ERRORS.TOO_LONG
        : '';
    if (problem) {
      setError(problem);
      return;
    }

    setPending(true);
    setError('');
    const answer = await demoLogin(value);
    setPending(false);
    if (answer.ok) onSignedIn({ accessToken: answer.accessToken, userId: answer.userId });
    else setError(LOGIN_ERRORS[answer.reason]);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <label htmlFor="uid" className="text-[15px] font-bold">
        Username or email
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="uid"
          type="text"
          autoComplete="username"
          placeholder="you@example.com"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'uid-error' : undefined}
          className={`h-13 min-w-0 grow rounded-xl border bg-white px-4 text-base outline-primary ${
            error ? 'border-[#B42318]' : 'border-line'
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-13 items-center justify-center gap-2.5 rounded-full bg-ink px-7 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-80"
        >
          {pending && <Spinner onDark className="size-4" />}
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      {error && (
        <span id="uid-error" role="alert" className="text-sm text-[#B42318]">
          {error}
        </span>
      )}
      <span className="text-sm text-muted">Sign in to join the sale. One unit per person.</span>
    </form>
  );
}
