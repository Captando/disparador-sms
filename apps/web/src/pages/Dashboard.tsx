import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Send,
    Users,
    Image,
    MessageSquare,
    TrendingUp,
    CheckCircle,
    XCircle,
    Clock,
    Smartphone
} from 'lucide-react';
import { api } from '../lib/api';

interface Stats {
    campaigns: { total: number; running: number };
    contacts: { total: number; optedOut: number };
    messages: { sent: number; failed: number; queued: number };
    session: { status: string };
}

export default function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const [campaigns, contacts, messages, session] = await Promise.all([
                api.get('/campaigns?limit=1'),
                api.get('/contacts?limit=1'),
                api.get('/messages/stats'),
                api.get('/sessions'),
            ]);

            setStats({
                campaigns: {
                    total: campaigns.data.pagination?.total || 0,
                    running: campaigns.data.data?.filter((c: any) => c.status === 'running').length || 0,
                },
                contacts: {
                    total: contacts.data.pagination?.total || 0,
                    optedOut: contacts.data.data?.filter((c: any) => c.opted_out).length || 0,
                },
                messages: {
                    sent: parseInt(messages.data.data?.sent || 0),
                    failed: parseInt(messages.data.data?.failed || 0),
                    queued: parseInt(messages.data.data?.queued || 0),
                },
                session: {
                    status: session.data.data?.status || 'disconnected',
                },
            });
        } catch (err) {
            console.error('Failed to load stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const getSessionStatusColor = (status: string) => {
        switch (status) {
            case 'connected': return 'text-emerald-400 bg-emerald-500/20';
            case 'needs-qr': return 'text-yellow-400 bg-yellow-500/20';
            default: return 'text-slate-400 bg-slate-500/20';
        }
    };

    const getSessionStatusText = (status: string) => {
        switch (status) {
            case 'connected': return 'Conectado';
            case 'needs-qr': return 'Aguardando QR';
            case 'error': return 'Erro';
            default: return 'Desconectado';
        }
    };

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="text-slate-400">Visão geral do sistema</p>
                </div>
                <Link to="/campaigns/new" className="btn btn-primary">
                    <Send className="w-4 h-4" />
                    Nova Campanha
                </Link>
            </div>

            {/* Session status card */}
            <div className="card">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary-500/20 to-primary-600/20 rounded-xl flex items-center justify-center">
                            <Smartphone className="w-6 h-6 text-primary-400" />
                        </div>
                        <div>
                            <h3 className="font-medium">Google Messages</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSessionStatusColor(stats?.session.status || 'disconnected')}`}>
                                    {getSessionStatusText(stats?.session.status || 'disconnected')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <Link to="/session" className="btn btn-secondary text-sm">
                        Gerenciar
                    </Link>
                </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Campaigns */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center">
                            <Send className="w-5 h-5 text-primary-400" />
                        </div>
                        <span className="text-xs text-slate-400">Campanhas</span>
                    </div>
                    <div className="text-2xl font-bold">{stats?.campaigns.total || 0}</div>
                    <div className="text-xs text-slate-400 mt-1">
                        {stats?.campaigns.running || 0} em execução
                    </div>
                </div>

                {/* Contacts */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                            <Users className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="text-xs text-slate-400">Contatos</span>
                    </div>
                    <div className="text-2xl font-bold">{stats?.contacts.total || 0}</div>
                    <div className="text-xs text-slate-400 mt-1">
                        {stats?.contacts.optedOut || 0} opt-out
                    </div>
                </div>

                {/* Sent messages */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-xs text-slate-400">Enviadas</span>
                    </div>
                    <div className="text-2xl font-bold">{stats?.messages.sent || 0}</div>
                    <div className="text-xs text-slate-400 mt-1">
                        {stats?.messages.queued || 0} na fila
                    </div>
                </div>

                {/* Failed messages */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-red-400" />
                        </div>
                        <span className="text-xs text-slate-400">Falhas</span>
                    </div>
                    <div className="text-2xl font-bold">{stats?.messages.failed || 0}</div>
                    <div className="text-xs text-red-400 mt-1">
                        Verificar logs
                    </div>
                </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link to="/contacts" className="card hover:border-primary-500/50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Users className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="font-medium">Gerenciar Contatos</h3>
                            <p className="text-sm text-slate-400">Importar, editar e organizar</p>
                        </div>
                    </div>
                </Link>

                <Link to="/media" className="card hover:border-primary-500/50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Image className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="font-medium">Biblioteca de Mídias</h3>
                            <p className="text-sm text-slate-400">Upload de imagens para RCS</p>
                        </div>
                    </div>
                </Link>

                <Link to="/messages" className="card hover:border-primary-500/50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <MessageSquare className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-medium">Ver Logs</h3>
                            <p className="text-sm text-slate-400">Histórico de mensagens</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
