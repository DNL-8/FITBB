import { lazy, Suspense, useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { AuthScreen } from './components/AuthScreen';
import { ErrorBanner, SystemHudSkeleton } from './components/StatusFeedback';
import { auth } from './firebaseApp';
import { getFriendlyErrorMessage } from './utils/errors';

const App = lazy(() => import('./App'));

export default function AppEntry() {
  const [user, setUser] = useState<User | null>();
  const [verified, setVerified] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (account) => {
      setVerified(account?.emailVerified === true);
      setUser(account);
    });
  }, []);

  useEffect(() => {
    let active = true;
    void getRedirectResult(auth)
      .then((result) => {
        if (!active || !result || result.user.uid !== auth.currentUser?.uid) return;
        setAuthError(null);
      })
      .catch((error: unknown) => {
        if (active) setAuthError(getFriendlyErrorMessage(error));
      });
    return () => { active = false; };
  }, []);

  if (user === undefined) return <SystemHudSkeleton />;

  if (!user) {
    return (
      <AuthScreen
        onError={setAuthError}
        authError={authError}
        clearError={() => setAuthError(null)}
      />
    );
  }

  if (!verified) {
    const checkEmail = async () => {
      setCheckingEmail(true);
      setAuthError(null);
      try {
        await user.reload();
        if (auth.currentUser?.uid !== user.uid) return;
        if (!user.emailVerified) {
          setAuthError('O e-mail ainda aguarda verificação.');
          return;
        }
        await user.getIdToken(true);
        if (auth.currentUser?.uid === user.uid) setVerified(true);
      } catch (error) {
        setAuthError(getFriendlyErrorMessage(error));
      } finally {
        setCheckingEmail(false);
      }
    };

    return (
      <main className="grid min-h-screen place-items-center bg-[#09090B] px-4 text-zinc-100">
        <section className="w-full max-w-md space-y-4 rounded-lg border border-zinc-800 bg-[#18181B] p-5">
          <h1 className="text-lg font-semibold">Verifique o e-mail da conta Google</h1>
          <p className="text-sm text-zinc-300">Confirme o e-mail na sua Conta Google e volte para liberar a sincronização.</p>
          <ErrorBanner message={authError} />
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={checkingEmail} onClick={() => void checkEmail()}
              className="rounded-md bg-orange-500 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50">
              {checkingEmail ? 'Verificando…' : 'Verificar novamente'}
            </button>
            <button type="button" onClick={() => {
              setAuthError(null);
              void signOut(auth).catch((error) => setAuthError(getFriendlyErrorMessage(error)));
            }} className="rounded-md border border-zinc-700 px-4 py-3 text-sm">
              Usar outra conta
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <Suspense fallback={<SystemHudSkeleton />}>
      <App key={user.uid} authUser={user} />
    </Suspense>
  );
}
