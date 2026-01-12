import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Plus, Play, Pause, Trash2, Loader2, Image, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';

interface Campaign {
    id: string;
    name: string;
    type: 'text' | 'image';
    status: string;
    total_recipients: number;
    sent_count: number;
    failed_count: number;
    media_url: string | null;
    created_at: string;
}

export default function Campaigns() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCampaigns();
    }, []);

    const loadCampaigns = async () => {
        try {
            const response = await api.get('/campaigns?limit=50');
            setCampaigns(response.data.data);
        } catch (err) {
            console.error('Failed to load campaigns:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleStart = async (id: string) => {
        try {
            await api.post(`/campaigns/${id}/start`);
            loadCampaigns();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao iniciar campanha');
        }
    };

    const handlePause = async (id: string) => {
        try {
            await api.post(`/campaigns/${id}/pause`);
            loadCampaigns();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao pausar campanha');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir esta campanha?')) return;

        try {
            await api.delete(`/campaigns/${id}`);
            loadCampaigns();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao excluir');
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'running': return <span className="badge badge-success">Executando</span>;
            case 'completed': return <span className="badge badge-info">Concluída</span>;
            case 'paused': return <span className="badge badge-warning">Pausada</span>;
            case 'scheduled': return <span className="badge badge-info">Agendada</span>;
            case 'cancelled': return <span className="badge badge-danger">Cancelada</span>;
            default: return <span className="badge badge-neutral">Rascunho</span>;
        }
    };

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Campanhas</h1>
                    <p className="text-slate-400">Gerenciar campanhas de mensagens</p>
                </div>
                <Link to="/campaigns/new" className="btn btn-primary">
                    <Plus className="w-4 h-4" />
                    Nova Campanha
                </Link>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="card text-center py-12">
                    <Send className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400 mb-4">Nenhuma campanha criada</p>
                    <Link to="/campaigns/new" className="btn btn-primary">
                        <Plus className="w-4 h-4" />
                        Criar Primeira Campanha
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {campaigns.map((campaign) => (
                        <div key={campaign.id} className="card">
                            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                {/* Icon */}
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${campaign.type === 'image' ? 'bg-purple-500/20' : 'bg-blue-500/20'
                                    }`}>
                                    {campaign.type === 'image' ? (
                                        <Image className="w-6 h-6 text-purple-400" />
                                    ) : (
                                        <MessageSquare className="w-6 h-6 text-blue-400" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold truncate">{campaign.name}</h3>
                                        {getStatusBadge(campaign.status)}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-slate-400">
                                        <span>{campaign.type === 'image' ? 'Imagem (RCS)' : 'Texto'}</span>
                                        <span className="hidden sm:inline">•</span>
                                        <span>{campaign.total_recipients} destinatários</span>
                                        {campaign.status === 'running' || campaign.status === 'completed' ? (
                                            <>
                                                <span className="hidden sm:inline">•</span>
                                                <span className="text-emerald-400">{campaign.sent_count} enviadas</span>
                                                {campaign.failed_count > 0 && (
                                                    <span className="text-red-400">• {campaign.failed_count} falhas</span>
                                                )}
                                            </>
                                        ) : null}
                                    </div>
                                </div>

                                {/* Progress bar for running */}
                                {campaign.status === 'running' && campaign.total_recipients > 0 && (
                                    <div className="w-full lg:w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary-500 transition-all"
                                            style={{
                                                width: `${((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100}%`
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2">
                                    {campaign.status === 'draft' && (
                                        <button onClick={() => handleStart(campaign.id)} className="btn btn-primary text-sm">
                                            <Play className="w-4 h-4" />
                                            Iniciar
                                        </button>
                                    )}
                                    {campaign.status === 'running' && (
                                        <button onClick={() => handlePause(campaign.id)} className="btn btn-secondary text-sm">
                                            <Pause className="w-4 h-4" />
                                            Pausar
                                        </button>
                                    )}
                                    {campaign.status === 'paused' && (
                                        <button onClick={() => handleStart(campaign.id)} className="btn btn-primary text-sm">
                                            <Play className="w-4 h-4" />
                                            Retomar
                                        </button>
                                    )}
                                    {campaign.status !== 'running' && (
                                        <button
                                            onClick={() => handleDelete(campaign.id)}
                                            className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
