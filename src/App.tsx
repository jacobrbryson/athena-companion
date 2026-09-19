import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Splash } from './pages/Splash';
import { SignIn } from './pages/SignIn';
import { CompanionConsole } from './pages/CompanionConsole';
import { AccessLocked } from './pages/AccessLocked';
import { LinkLost } from './pages/LinkLost';
import { useState } from 'react';
import { LocalServerPanel } from './components/LocalServerPanel';
import { connection } from './localConnection';
import { AndroidRegistration } from './native/AndroidRegistration';

/** Home: Athena when signed in, otherwise the sign-in gate. */
function Home() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'unreachable') return <LinkLost />;
  if (status === 'locked') return <AccessLocked />;
  if (status === 'authenticated') return <CompanionConsole />;
  return <SignIn />;
}

export default function App() {
  const [setup, setSetup] = useState(connection.kind === 'blocked');
  return (
    <>
    {connection.kind !== 'blocked' &&
    <AuthProvider>
      <AndroidRegistration />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    }
    {/*
      Only shown when the connection is BLOCKED. In that state the console
      never renders, so closing the setup panel would otherwise leave no way
      back into it. Everywhere else this lives in the console menu
      (⋯ → Local server) rather than floating over the chat.
    */}
    {connection.kind === 'blocked' && !setup && (
      <div className="fixed bottom-0 left-0 z-40 max-w-[75vw] rounded bg-black/90 px-2 text-[10px] text-emerald-200">
        <button onClick={() => setSetup(true)} className="underline">Local server setup</button>
        {connection.message && <span className="ml-2">{connection.message}</span>}
      </div>
    )}
    {setup && <LocalServerPanel onClose={() => setSetup(false)} />}
    </>
  );
}
