import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { BrowserAuthStatus } from '@archimesh/contracts';
import { signInWithPassphrase } from './api';
import { Icon } from './ui';

export function SignIn({
  mode,
  onSignIn,
}: {
  mode: BrowserAuthStatus['mode'] | 'loading' | 'unavailable';
  onSignIn: (state: BrowserAuthStatus) => void;
}) {
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: signInWithPassphrase,
    onSuccess: onSignIn,
  });
  const failure = new URLSearchParams(window.location.search).get('signIn');
  return (
    <main className="sign-in-page">
      <section className="sign-in-card" aria-labelledby="sign-in-title">
        <div className="brand-mark" aria-hidden="true">
          <Icon name="mesh" size={22} />
        </div>
        <h1 id="sign-in-title">ArchiMesh</h1>
        {mode === 'lan' && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              login.mutate(password.trim());
            }}
          >
            <p>Sign in with the access passphrase from the host PC.</p>
            <label className="field">
              Access passphrase
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {login.isError && (
              <p className="form-error" role="alert">
                Sign-in failed. Check the access passphrase and try again.
              </p>
            )}
            <button className="button primary" disabled={login.isPending}>
              Sign in
            </button>
          </form>
        )}
        {mode === 'entra' && (
          <>
            <p>Use your organization’s Microsoft account.</p>
            {failure && (
              <p className="form-error" role="alert">
                {failure === 'denied'
                  ? 'Your directory account has no ArchiMesh access.'
                  : 'Sign-in could not be completed. Try again.'}
              </p>
            )}
            <a className="button primary" href="/api/auth/entra/start">
              Sign in with Microsoft
            </a>
          </>
        )}
        {mode === 'loading' && <p role="status">Checking access…</p>}
        {mode === 'disabled' && (
          <p role="status">Sign-in is unavailable on this server.</p>
        )}
        {mode === 'unavailable' && (
          <p role="alert">Could not reach the ArchiMesh server.</p>
        )}
      </section>
    </main>
  );
}
