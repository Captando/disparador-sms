import axios from 'axios';
import { useAuthStore } from '../stores/auth';

export const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
    const { accessToken } = useAuthStore.getState();

    if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            const refreshed = await useAuthStore.getState().refresh();

            if (refreshed) {
                const { accessToken } = useAuthStore.getState();
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return api(originalRequest);
            }

            // Redirect to login
            window.location.href = '/login';
        }

        return Promise.reject(error);
    }
);
