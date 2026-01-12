import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

export default function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [tenantName, setTenantName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const { login, register } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password, tenantName);
            }
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erro ao processar requisição');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8 fade-in">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl mb-4 shadow-lg shadow-primary-500/25">
                        <Send className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold">SMS Platform</h1>
                    <p className="text-slate-400 mt-1">Sistema Multi-Tenant de Mensagens</p>
                </div>

                {/* Card */}
                <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
                    <div className="flex mb-6">
                        <button
                            type="button"
                            onClick={() => setIsLogin(true)}
                            className={`flex-1 py-2 text-sm font-medium transition-all ${isLogin
                                    ? 'text-primary-400 border-b-2 border-primary-400'
                                    : 'text-slate-400 border-b border-slate-700'
                                }`}
                        >
                            Entrar
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsLogin(false)}
                            className={`flex-1 py-2 text-sm font-medium transition-all ${!isLogin
                                    ? 'text-primary-400 border-b-2 border-primary-400'
                                    : 'text-slate-400 border-b border-slate-700'
                                }`}
                        >
                            Criar Conta
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Nome da Empresa
                                </label>
                                <input
                                    type="text"
                                    value={tenantName}
                                    onChange={(e) => setTenantName(e.target.value)}
                                    className="input"
                                    placeholder="Minha Empresa"
                                    required={!isLogin}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Senha
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pr-10"
                                    placeholder="••••••••"
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {!isLogin && (
                                <p className="text-xs text-slate-400 mt-1">
                                    Mínimo 8 caracteres com letra maiúscula, minúscula e número
                                </p>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn btn-primary justify-center py-3"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                isLogin ? 'Entrar' : 'Criar Conta'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
