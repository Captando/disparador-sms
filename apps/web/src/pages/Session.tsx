import { useEffect, useState, useRef } from 'react';
import { Smartphone, RefreshCw, Loader2, CheckCircle, XCircle, QrCode } from 'lucide-react';
import { api } from '../lib/api';

interface SessionState {
    status: 'connected' | 'disconnected' | 'needs-qr' | 'error';
    qrCode: string | null;
    errorMessage: string | null;
    lastSeenAt: string | null;
}

export default function Session() {
    const [session, setSession] = useState<SessionState | null>(null);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        loadSession();

        return () => {
            eventSourceRef.current?.close();
        };
    }, []);

    const loadSession = async () => {
        try {
            const response = await api.get('/sessions');
            setSession(response.data.data);
        } catch (err) {
            console.error('Failed to load session:', err);
        } finally {
            setLoading(false);
        }
    };

    const startQRStream = () => {
        // Close existing connection
        eventSourceRef.current?.close();

        // Start SSE connection for QR updates
        const eventSource = new EventSource('/api/sessions/qr/stream');
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('status', (event) => {
            const data = JSON.parse(event.data);
            setSession(prev => ({
                ...prev!,
                status: data.status,
                qrCode: data.qrCode,
                errorMessage: data.errorMessage,
            }));

            if (data.status === 'connected') {
                setConnecting(false);
                eventSource.close();
            }
        });

        eventSource.onerror = () => {
            setConnecting(false);
            eventSource.close();
        };
    };

    const handleConnect = async () => {
        setConnecting(true);

        try {
            await api.post('/sessions/connect');
            startQRStream();
        } catch (err) {
            console.error('Failed to connect:', err);
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await api.post('/sessions/disconnect');
            loadSession();
        } catch (err) {
            console.error('Failed to disconnect:', err);
        }
    };

    const getStatusBadge = () => {
        switch (session?.status) {
            case 'connected':
                return (
                    <span className="badge badge-success flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Conectado
                    </span>
                );
            case 'needs-qr':
                return (
                    <span className="badge badge-warning flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5" />
                        Aguardando QR
                    </span>
                );
            case 'error':
                return (
                    <span className="badge badge-danger flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        Erro
                    </span>
                );
            default:
                return (
                    <span className="badge badge-neutral">
                        Desconectado
                    </span>
                );
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Sessão Google Messages</h1>
                <p className="text-slate-400">Gerencie a conexão com o Google Messages Web</p>
            </div>

            {/* Status card */}
            <div className="card">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-500/20 to-primary-600/20 rounded-xl flex items-center justify-center">
                        <Smartphone className="w-7 h-7 text-primary-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Status da Sessão</h2>
                        <div className="mt-1">{getStatusBadge()}</div>
                    </div>
                </div>

                {session?.lastSeenAt && session.status === 'connected' && (
                    <p className="text-sm text-slate-400 mb-4">
                        Última atividade: {new Date(session.lastSeenAt).toLocaleString('pt-BR')}
                    </p>
                )}

                {session?.errorMessage && (
                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400 mb-4">
                        {session.errorMessage}
                    </div>
                )}

                {/* QR Code display */}
                {(session?.status === 'needs-qr' || connecting) && session?.qrCode && (
                    <div className="flex flex-col items-center py-6">
                        <div className="p-4 bg-white rounded-2xl shadow-xl mb-4">
                            <img
                                src={session.qrCode}
                                alt="QR Code"
                                className="w-64 h-64"
                            />
                        </div>
                        <p className="text-sm text-slate-400 text-center">
                            Escaneie o QR Code com seu celular
                            <br />
                            <span className="text-xs">Abra Google Messages → Pareamento de dispositivos</span>
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    {session?.status === 'connected' ? (
                        <button onClick={handleDisconnect} className="btn btn-danger">
                            Desconectar
                        </button>
                    ) : (
                        <button
                            onClick={handleConnect}
                            disabled={connecting}
                            className="btn btn-primary"
                        >
                            {connecting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Conectando...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4" />
                                    Conectar
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="card">
                <h3 className="font-semibold mb-4">Como conectar</h3>
                <ol className="space-y-3 text-sm text-slate-300">
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                        <span>Clique em "Conectar" para gerar um QR Code</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                        <span>Abra o app Google Messages no seu celular Android</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-medium">3</span>
                        <span>Toque no menu (⋮) → "Pareamento de dispositivos"</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-medium">4</span>
                        <span>Escaneie o QR Code exibido nesta página</span>
                    </li>
                </ol>
            </div>
        </div>
    );
}
