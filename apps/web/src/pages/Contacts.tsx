import { useEffect, useState } from 'react';
import { Users, Plus, Upload, Search, Trash2, Loader2, Tag, Ban, Smartphone } from 'lucide-react';
import { api } from '../lib/api';

interface Contact {
    id: string;
    phone_e164: string;
    name: string | null;
    tags: string[];
    opted_out: boolean;
    created_at: string;
}

export default function Contacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    useEffect(() => {
        loadContacts();
    }, [page, search]);

    const loadContacts = async () => {
        try {
            const params = new URLSearchParams({ page: String(page), limit: '20' });
            if (search) params.append('search', search);

            const response = await api.get(`/contacts?${params}`);
            setContacts(response.data.data);
            setTotal(response.data.pagination?.total || 0);
        } catch (err) {
            console.error('Failed to load contacts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir este contato?')) return;

        try {
            await api.delete(`/contacts/${id}`);
            loadContacts();
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    };

    const handleOptOut = async (id: string, optedOut: boolean) => {
        try {
            await api.post(`/contacts/${id}/${optedOut ? 'opt-in' : 'opt-out'}`);
            loadContacts();
        } catch (err) {
            console.error('Failed to opt out:', err);
        }
    };

    const handleSyncFromPhone = async () => {
        if (syncing) return;

        if (!confirm('Isso irá importar os contatos do telefone conectado. Pode levar alguns minutos. Continuar?')) {
            return;
        }

        setSyncing(true);
        try {
            await api.post('/contacts/sync-from-phone');
            alert('Sincronização iniciada! Os contatos serão importados em alguns minutos. Atualize a página depois.');
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao iniciar sincronização');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Contatos</h1>
                    <p className="text-slate-400">{total} contatos cadastrados</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={handleSyncFromPhone}
                        disabled={syncing}
                        className="btn btn-secondary"
                        title="Importar contatos do telefone conectado"
                    >
                        {syncing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Smartphone className="w-4 h-4" />
                        )}
                        {syncing ? 'Sincronizando...' : 'Do Telefone'}
                    </button>
                    <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
                        <Upload className="w-4 h-4" />
                        Importar
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                        <Plus className="w-4 h-4" />
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="input pl-10"
                    placeholder="Buscar por nome ou telefone..."
                />
            </div>

            {/* Table */}
            <div className="card overflow-hidden p-0">
                {loading ? (
                    <div className="flex items-center justify-center p-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                    </div>
                ) : contacts.length === 0 ? (
                    <div className="text-center p-12 text-slate-400">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhum contato encontrado</p>
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Telefone</th>
                                <th>Nome</th>
                                <th>Tags</th>
                                <th>Status</th>
                                <th className="text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {contacts.map((contact) => (
                                <tr key={contact.id}>
                                    <td className="font-mono text-sm">{contact.phone_e164}</td>
                                    <td>{contact.name || '-'}</td>
                                    <td>
                                        <div className="flex gap-1 flex-wrap">
                                            {contact.tags.map((tag, i) => (
                                                <span key={i} className="badge badge-info text-xs">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        {contact.opted_out ? (
                                            <span className="badge badge-danger">Opt-out</span>
                                        ) : (
                                            <span className="badge badge-success">Ativo</span>
                                        )}
                                    </td>
                                    <td className="text-right">
                                        <button
                                            onClick={() => handleOptOut(contact.id, contact.opted_out)}
                                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-yellow-400"
                                            title={contact.opted_out ? 'Opt-in' : 'Opt-out'}
                                        >
                                            <Ban className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(contact.id)}
                                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

            {/* Add Contact Modal - simplified */}
            {showAddModal && (
                <AddContactModal onClose={() => setShowAddModal(false)} onSuccess={loadContacts} />
            )}

            {/* Import Modal - simplified */}
            {showImportModal && (
                <ImportModal onClose={() => setShowImportModal(false)} onSuccess={loadContacts} />
            )}
        </div>
    );
}

function AddContactModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.post('/contacts', { phoneE164: phone, name: name || undefined });
            onSuccess();
            onClose();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao adicionar contato');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-md">
                <h2 className="text-lg font-semibold mb-4">Adicionar Contato</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Telefone (E.164)</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="input"
                            placeholder="+5511999999999"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Nome (opcional)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="input"
                            placeholder="João Silva"
                        />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
                        <button type="submit" disabled={loading} className="btn btn-primary">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [csv, setCsv] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Parse CSV: phone,name
            const lines = csv.trim().split('\n');
            const contacts = lines.map(line => {
                const [phone, name] = line.split(',').map(s => s.trim());
                return { phone, name };
            });

            const response = await api.post('/contacts/import', { contacts, skipInvalid: true });
            setResult(response.data.data);
            onSuccess();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Erro ao importar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-lg">
                <h2 className="text-lg font-semibold mb-4">Importar Contatos</h2>
                {result ? (
                    <div className="text-center py-4">
                        <p className="text-lg font-medium text-emerald-400">{result.imported} contatos importados</p>
                        {result.skipped > 0 && (
                            <p className="text-sm text-yellow-400">{result.skipped} ignorados (inválidos)</p>
                        )}
                        <button onClick={onClose} className="btn btn-primary mt-4">Fechar</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">
                                Dados CSV (telefone,nome)
                            </label>
                            <textarea
                                value={csv}
                                onChange={(e) => setCsv(e.target.value)}
                                className="input h-40 font-mono text-sm"
                                placeholder={"+5511999999999,João Silva\n+5511888888888,Maria Santos"}
                                required
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
                            <button type="submit" disabled={loading} className="btn btn-primary">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Importar'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
