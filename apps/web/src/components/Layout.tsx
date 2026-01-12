import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Smartphone,
    Users,
    Image,
    Send,
    MessageSquare,
    LogOut,
    Menu,
    X
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../stores/auth';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/session', icon: Smartphone, label: 'Sessão' },
    { path: '/contacts', icon: Users, label: 'Contatos' },
    { path: '/media', icon: Image, label: 'Mídias' },
    { path: '/campaigns', icon: Send, label: 'Campanhas' },
    { path: '/messages', icon: MessageSquare, label: 'Mensagens' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen flex">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 glass border-r border-slate-700/50
        transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="p-6 border-b border-slate-700/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-xl flex items-center justify-center">
                                <Send className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-bold text-lg">SMS Platform</h1>
                                <p className="text-xs text-slate-400">Multi-Tenant</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => setSidebarOpen(false)}
                                className={({ isActive }) => `
                  flex items-center gap-3 px-4 py-3 rounded-lg
                  transition-all duration-200
                  ${isActive
                                        ? 'bg-primary-500/20 text-primary-400 shadow-lg shadow-primary-500/10'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                    }
                `}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="font-medium">{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>

                    {/* User section */}
                    <div className="p-4 border-t border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-700 rounded-full flex items-center justify-center">
                                <span className="text-sm font-semibold">
                                    {user?.email?.[0].toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user?.email}</p>
                                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="font-medium">Sair</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Mobile header */}
                <header className="lg:hidden glass border-b border-slate-700/50 p-4">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 hover:bg-slate-800 rounded-lg"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                </header>

                {/* Page content */}
                <main className="flex-1 p-6 lg:p-8 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
