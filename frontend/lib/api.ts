import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let refreshPromise: Promise<void> | null = null;

function refreshAuthToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('csrf_token='));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.split('=').slice(1).join('='));
}

apiClient.interceptors.request.use((config) => {
  const csrfToken = getCsrfTokenFromCookie();
  if (!csrfToken) {
    return config;
  }

  const headers = AxiosHeaders.from(config.headers ?? {});
  headers.set('x-csrf-token', csrfToken);
  config.headers = headers;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as (InternalAxiosRequestConfig & { _retry?: boolean; url?: string }) | undefined;

    if (!error || !originalRequest || !error.response || error.response.status !== 403) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes('/auth/refresh') || originalRequest._retry) {
      return Promise.reject(error);
    }

    try {
      originalRequest._retry = true;
      await refreshAuthToken();

      const csrfToken = getCsrfTokenFromCookie();
      const headers = AxiosHeaders.from(originalRequest.headers ?? {});
      if (csrfToken) {
        headers.set('x-csrf-token', csrfToken);
      }
      originalRequest.headers = headers;

      return apiClient.request(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
