import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { ConfirmHost, Spinner, Button, EmptyState } from './lib/ui';
import { ToastHost } from './lib/toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { useDarkMode } from './lib/theme';
import AppShell from './components/AppShell';
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const RegisterDoctor = lazy(() => import('./pages/auth/RegisterDoctor'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FindDoctors = lazy(() => import('./pages/patient/FindDoctors'));
const DoctorDetail = lazy(() => import('./pages/patient/DoctorDetail'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const AppointmentDetail = lazy(() => import('./pages/AppointmentDetail'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const Availability = lazy(() => import('./pages/doctor/Availability'));
const AdminDoctors = lazy(() => import('./pages/admin/Doctors'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
// Each page's code is downloaded the first time it is opened, which keeps the first load small.
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/auth/ForgotPassword').then((m) => ({ default: m.ResetPassword })));

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
      <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
          <Suspense fallback={<FullPageSpinner />}>
            <AppRoutes />
          </Suspense>
        </AuthProvider>
      </BrandingProvider>
    </BrowserRouter>
  );
}
