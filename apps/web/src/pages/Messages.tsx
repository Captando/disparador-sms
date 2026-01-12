import { useEffect, useState } from 'react';
import { MessageSquare, Search, Loader2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

interface Message {
    id: string;
    phone_e164: string;
    body_text: string | null;
    media_url: string | null;
    fallback_used: boolean;
    status: string;
    error: string | null;
    attempts: number;
    campaign_name: string | null;
    contact_name: string | null;
    queued_at: string;
    sent_at: string | null;
}

export default function Messages() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState<string>('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadMessages();
    }, [page, status]);

    const loadMessages = async () => {
        try {
            const params = new URLSearchParams({ page: String(page), limit: '20' });
            if (status) params.append('status', status);
            if (search) params.append('phoneE164', search);

            const response = await api.get(`/messages?${params}`);
            setMessages(response.data.data);
            setTotal(response.data.pagination?.total || 0);
        } catch (err) {
            console.error('Failed to load messages:', err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'sent':
            case 'delivered':
                return <CheckCircle className="w-4 h-4 text-emerald-400" />;
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-400" />;
            case 'sending':
                return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
            default:
                return <Clock className="w-4 h-4 text-slate-400" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'sent': return <span className="badge badge-success">Enviada</span>;
            case 'delivered': return <span className="badge badge-success">Entregue</span>;
            case 'failed': return <span className="badge badge-danger">Falha</span>;
            case 'sending': return <span className="badge badge-info">Enviando</span>;
            case 'cancelled': return <span className="badge badge-neutral">Cancelada</span>;
            default: return <span className="badge badge-warning">Na Fila</span>;
        }
    };

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Logs de Mensagens</h1>
                    <p className="text-slate-400">{total} mensagens registradas</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadMessages()}
                        className="input pl-10"
                        placeholder="Buscar por telefone..."
                    />
                </div>
                <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                    className="input w-auto"
                >
                    <option value="">Todos os status</option>
                    <option value="queued">Na Fila</option>
                    <option value="sending">Enviando</option>
                    <option value="sent">Enviada</option>
                    <option value="delivered">Entregue</option>
                    <option value="failed">Falha</option>
                    <option value="cancelled">Cancelada</option>
                </select>
            </div>

            {/* Table */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center p-12 text-slate-400">
                        <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhuma mensagem encontrada</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Telefone</th>
                                    <th>Contato</th>
                                    <th>Campanha</th>
                                    <th>Mensagem</th>
                                    <th>Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {messages.map((msg) => (
                                    <tr key={msg.id}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(msg.status)}
                                                {getStatusBadge(msg.status)}
                                            </div>
                                        </td>
                                        <td className="font-mono text-sm">{msg.phone_e164}</td>
                                        <td>{msg.contact_name || '-'}</td>
                                        <td>{msg.campaign_name || '-'}</td>
                                        <td>
                                            <div className="max-w-xs">
                                                <p className="text-sm truncate">{msg.body_text || '-'}</p>
                                                {msg.fallback_used && (
                                                    <span className="text-xs text-yellow-400">Fallback usado</span>
                                                )}
                                                {msg.error && (
                                                    <p className="text-xs text-red-400 truncate" title={msg.error}>
                                                        {msg.error}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-sm text-slate-400 whitespace-nowrap">
                                            {msg.sent_at
                                                ? new Date(msg.sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                                                : new Date(msg.queued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {total > 20 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="btn btn-secondary"
                    >
                        Anterior
                    </button>
                    <span className="px-4 py-2 text-slate-400">
                        Página {page} de {Math.ceil(total / 20)}
                    </span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={page * 20 >= total}
                        className="btn btn-secondary"
                    >
                        Próxima
                    </button>
                </div>
            )}
        </div>
    );
}
