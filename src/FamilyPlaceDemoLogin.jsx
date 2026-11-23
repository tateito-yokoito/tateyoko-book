import React, { useState } from 'react';

// Family-place entry only. The ordinary BOOK email/LINE login is unchanged.
// The form has no sign-up path and never persists the password itself.
export default function FamilyPlaceDemoLogin({ client, onBack, onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (signInError || !data?.user) throw signInError || new Error('Login failed');
      setPassword('');
      onAuthenticated?.(data.user);
    } catch {
      // Keep account existence and auth details out of the page and logs.
      setError('ログインできませんでした。IDとパスワードを確認してください。');
    } finally { setBusy(false); }
  };

  return <main className="fp-demo-login">
    <h1>デモアカウントで開く</h1>
    <p>ご案内したデモ用IDとパスワードを入力してください。</p>
    <form onSubmit={submit}>
      <label>デモ用ID<input type="email" autoComplete="username" required value={email}
        onChange={event => setEmail(event.target.value)} disabled={busy}/></label>
      <label>パスワード<input type="password" autoComplete="current-password" required
        value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || !email.trim() || !password}>
        {busy ? '確認しています…' : 'デモを開く'}
      </button>
    </form>
    <button type="button" className="fp-demo-login-back" onClick={onBack}>通常のログインに戻る</button>
  </main>;
}
