import { useEffect, useState, useRef } from 'react';
import { Image, Upload, Trash2, Copy, Loader2, Check } from 'lucide-react';
import { api } from '../lib/api';

interface MediaItem {
    id: string;
    filename: string;
    original_filename: string;
    url: string;
    mime: string;
    size_bytes: number;
    created_at: string;
}

export default function Media() {
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            setLoading(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            alert('Apenas imagens PNG, JPEG e WebP são permitidas');
            return;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('O arquivo deve ter no máximo 10MB');
            return;
        }

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            await api.post('/media/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            loadMedia();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao fazer upload');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir esta mídia?')) return;

        try {
            await api.delete(`/media/${id}`);
            loadMedia();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao excluir');
        }
    };

    const copyUrl = (id: string, url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Biblioteca de Mídias</h1>
                    <p className="text-slate-400">Imagens para campanhas RCS</p>
                </div>
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleUpload}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="btn btn-primary"
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Upload
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                </div>
            ) : media.length === 0 ? (
                <div className="card text-center py-12">
                    <Image className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p className="text-slate-400">Nenhuma mídia encontrada</p>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-primary mt-4"
                    >
                        <Upload className="w-4 h-4" />
                        Fazer primeiro upload
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {media.map((item) => (
                        <div key={item.id} className="card p-3 group">
                            <div className="aspect-square bg-slate-800 rounded-lg overflow-hidden mb-3">
                                <img
                                    src={item.url}
                                    alt={item.original_filename}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                            </div>
                            <p className="text-sm font-medium truncate" title={item.original_filename}>
                                {item.original_filename}
                            </p>
                            <p className="text-xs text-slate-400">{formatSize(item.size_bytes)}</p>
                            <div className="flex gap-1 mt-2">
                                <button
                                    onClick={() => copyUrl(item.id, item.url)}
                                    className="flex-1 btn btn-secondary text-xs py-1.5"
                                >
                                    {copiedId === item.id ? (
                                        <>
                                            <Check className="w-3 h-3" />
                                            Copiado
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            Copiar URL
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
