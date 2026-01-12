import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Image, MessageSquare, Loader2, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';

interface MediaItem {
    id: string;
    original_filename: string;
    url: string;
}

export default function CampaignCreate() {
    const [type, setType] = useState<'text' | 'image'>('text');
    const [name, setName] = useState('');
    const [templateText, setTemplateText] = useState('');
    const [mediaId, setMediaId] = useState<string | null>(null);
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMedia, setLoadingMedia] = useState(true);

    const navigate = useNavigate();

    useEffect(() => {
        loadMedia();
    }, []);

    const loadMedia = async () => {
        try {
            const response = await api.get('/media?limit=50');
            setMedia(response.data.data);
        } catch (err) {
            console.error('Failed to load media:', err);
        } finally {
            setLoadingMedia(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.post('/campaigns', {
                name,
                type,
                templateText: templateText || undefined,
                mediaId: type === 'image' ? mediaId : undefined,
            });

            navigate('/campaigns');
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao criar campanha');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 fade-in max-w-2xl">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/campaigns')} className="btn btn-secondary p-2">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold">Nova Campanha</h1>
                    <p className="text-slate-400">Configure sua campanha de mensagens</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Type selection */}
                <div className="card">
                    <h2 className="font-semibold mb-4">Tipo de Campanha</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={() => setType('text')}
                            className={`p-4 rounded-xl border-2 transition-all ${type === 'text'
                                    ? 'border-primary-500 bg-primary-500/10'
                                    : 'border-slate-700 hover:border-slate-600'
                                }`}
                        >
                            <MessageSquare className={`w-8 h-8 mx-auto mb-2 ${type === 'text' ? 'text-primary-400' : 'text-slate-400'}`} />
                            <p className="font-medium">Texto</p>
                            <p className="text-xs text-slate-400">SMS/RCS simples</p>
                        </button>

                        <button
                            type="button"
                            onClick={() => setType('image')}
                            className={`p-4 rounded-xl border-2 transition-all ${type === 'image'
                                    ? 'border-primary-500 bg-primary-500/10'
                                    : 'border-slate-700 hover:border-slate-600'
                                }`}
                        >
                            <Image className={`w-8 h-8 mx-auto mb-2 ${type === 'image' ? 'text-primary-400' : 'text-slate-400'}`} />
                            <p className="font-medium">Imagem</p>
                            <p className="text-xs text-slate-400">RCS com mídia</p>
                        </button>
                    </div>
                </div>

                {/* Campaign details */}
                <div className="card">
                    <h2 className="font-semibold mb-4">Detalhes</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Nome da Campanha</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input"
                                placeholder="Ex: Promoção Janeiro"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                Mensagem
                                <span className="text-slate-500 font-normal ml-2">
                                    Variáveis: {'{nome}'}, {'{cidade}'}
                                </span>
                            </label>
                            <textarea
                                value={templateText}
                                onChange={(e) => setTemplateText(e.target.value)}
                                className="input h-32"
                                placeholder="Olá {nome}! Confira nossa promoção especial..."
                                required={type === 'text'}
                            />
                        </div>

                        {/* Media selection for image type */}
                        {type === 'image' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Selecione uma Imagem</label>
                                {loadingMedia ? (
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Carregando...
                                    </div>
                                ) : media.length === 0 ? (
                                    <p className="text-sm text-slate-400">
                                        Nenhuma mídia disponível. <a href="/media" className="text-primary-400 hover:underline">Upload uma imagem</a>
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2">
                                        {media.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setMediaId(item.id)}
                                                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${mediaId === item.id
                                                        ? 'border-primary-500 ring-2 ring-primary-500/50'
                                                        : 'border-transparent hover:border-slate-600'
                                                    }`}
                                            >
                                                <img src={item.url} alt={item.original_filename} className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Preview */}
                <div className="card bg-slate-900/50">
                    <h2 className="font-semibold mb-4">Preview</h2>
                    <div className="bg-slate-800 rounded-2xl p-4 max-w-xs">
                        {type === 'image' && mediaId && (
                            <img
                                src={media.find(m => m.id === mediaId)?.url}
                                alt="Preview"
                                className="w-full rounded-lg mb-2"
                            />
                        )}
                        <p className="text-sm whitespace-pre-wrap">
                            {templateText.replace(/\{nome\}/gi, 'João').replace(/\{cidade\}/gi, 'São Paulo') || 'Sua mensagem aparecerá aqui...'}
                        </p>
                    </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/campaigns')}
                        className="btn btn-secondary"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading || (type === 'image' && !mediaId)}
                        className="btn btn-primary flex-1"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Criar Campanha
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
