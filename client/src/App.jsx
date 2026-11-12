import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { ConfirmHost, Spinner, Button, EmptyState } from './lib/ui';
import { ToastHost } from './lib/toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { useDarkMode } from './lib/theme';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import RegisterDoctor from './pages/auth/RegisterDoctor';
import DashboardPage from './pages/DashboardPage';
import FindDoctors from './pages/patient/FindDoctors';
import DoctorDetail from './pages/patient/DoctorDetail';
import AppointmentsPage from './pages/AppointmentsPage';
import AppointmentDetail from './pages/AppointmentDetail';
import NotificationsPage from './pages/NotificationsPage';
import AccountPage from './pages/AccountPage';
import Availability from './pages/doctor/Availability';
import AdminDoctors from './pages/admin/Doctors';
import AdminUsers from './pages/admin/Users';
import AdminSettings from './pages/admin/Settings';

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Spinner />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Wrong role → back to the dashboard rather than a dead end. */
function RequireRole({ roles, approvedDoctor = false, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  if (approvedDoctor && user.role === 'doctor' && user.doctorProfile?.status !== 'approved') return <Navigate to="/dashboard" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        hint="The page you are looking for does not exist or was moved."
        action={
          <Link to="/">
            <Button variant="primary">Go home</Button>
          </Link>
        }
      />
    </div>
  );
}

function AppRoutes() {
  useDarkMode(); // apply the saved theme on public pages too
  const patient = (el) => <RequireRole roles={['user']}>{el}</RequireRole>;
  const doctor = (el) => (
    <RequireRole roles={['doctor']} approvedDoctor>
      {el}
    </RequireRole>
  );
  const admin = (el) => <RequireRole roles={['admin']}>{el}</RequireRole>;
  const practising = (el) => (
    <RequireRole roles={['user', 'doctor', 'admin']} approvedDoctor>
      {el}
    </RequireRole>
  );

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/register/doctor" element={<GuestOnly><RegisterDoctor /></GuestOnly>} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/doctors" element={patient(<FindDoctors />)} />
        <Route path="/doctors/:id" element={patient(<DoctorDetail />)} />
        <Route path="/appointments" element={practising(<AppointmentsPage />)} />
        <Route path="/appointments/:id" element={practising(<AppointmentDetail />)} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/account" element={<RequireRole roles={['user', 'doctor']}><AccountPage /></RequireRole>} />
        <Route path="/availability" element={doctor(<Availability />)} />
        <Route path="/admin/doctors" element={admin(<AdminDoctors />)} />
        <Route path="/admin/users" element={admin(<AdminUsers />)} />
        <Route path="/admin/settings" element={admin(<AdminSettings />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <BrandingProvider>
        <AuthProvider>
          <ConfirmHost />
          <ToastHost />
          <AppRoutes />
        </AuthProvider>
      </BrandingProvider>
    </BrowserRouter>
  );
}
