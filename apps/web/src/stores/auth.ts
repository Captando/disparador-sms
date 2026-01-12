import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';

interface User {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenantId: string;
}

interface AuthState {
    user: User | null;
    accessToken: string | null;
    refreshToken: string | null;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, tenantName: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            refreshToken: null,

            login: async (email: string, password: string) => {
                const response = await api.post('/auth/login', { email, password });
                const { user, accessToken, refreshToken } = response.data.data;

                set({ user, accessToken, refreshToken });
            },

            register: async (email: string, password: string, tenantName: string) => {
                const response = await api.post('/auth/register', { email, password, tenantName });
                const { user, accessToken, refreshToken } = response.data.data;

                set({ user, accessToken, refreshToken });
            },

            logout: async () => {
                const { refreshToken } = get();

                try {
                    if (refreshToken) {
                        await api.post('/auth/logout', { refreshToken });
                    }
                } catch {
                    // Ignore errors on logout
                }

                set({ user: null, accessToken: null, refreshToken: null });
            },

            refresh: async () => {
                const { refreshToken } = get();

                if (!refreshToken) return false;

                try {
                    const response = await api.post('/auth/refresh', { refreshToken });
                    const { accessToken, refreshToken: newRefreshToken } = response.data.data;

                    set({ accessToken, refreshToken: newRefreshToken });
                    return true;
                } catch {
                    set({ user: null, accessToken: null, refreshToken: null });
                    return false;
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                accessToken: state.accessToken,
                refreshToken: state.refreshToken,
            }),
        }
    )
);
