import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Session from './pages/Session';
import Contacts from './pages/Contacts';
import Media from './pages/Media';
import Campaigns from './pages/Campaigns';
import CampaignCreate from './pages/CampaignCreate';
import Messages from './pages/Messages';

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const { user } = useAuthStore();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <Layout>{children}</Layout>;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={
                <PrivateRoute>
                    <Dashboard />
                </PrivateRoute>
            } />

            <Route path="/session" element={
                <PrivateRoute>
                    <Session />
                </PrivateRoute>
            } />

            <Route path="/contacts" element={
                <PrivateRoute>
                    <Contacts />
                </PrivateRoute>
            } />

            <Route path="/media" element={
                <PrivateRoute>
                    <Media />
                </PrivateRoute>
            } />

            <Route path="/campaigns" element={
                <PrivateRoute>
                    <Campaigns />
                </PrivateRoute>
            } />

            <Route path="/campaigns/new" element={
                <PrivateRoute>
                    <CampaignCreate />
                </PrivateRoute>
            } />

            <Route path="/messages" element={
                <PrivateRoute>
                    <Messages />
                </PrivateRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
