import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Splash } from './pages/Splash';
import { SignIn } from './pages/SignIn';
import { CompanionConsole } from './pages/CompanionConsole';
import { AccessLocked } from './pages/AccessLocked';

/** Home: Athena when signed in, otherwise the sign-in gate. */
function Home() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'locked') return <AccessLocked />;
  if (status === 'authenticated') return <CompanionConsole />;
  return <SignIn />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
