import type { CreateDownloadRequest, CreateDownloadResponse, Job, JobListResponse } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Only set Content-Type if body is present
  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new APIError(response.status, errorText || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Downloads
  createDownload: async (data: CreateDownloadRequest): Promise<CreateDownloadResponse> => {
    return apiRequest('/downloads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getDownloads: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    search?: string;
  }): Promise<JobListResponse> => {
    const searchParams = new URLSearchParams();

    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.search) searchParams.set('search', params.search);

    const query = searchParams.toString();
    return apiRequest(`/downloads${query ? `?${query}` : ''}`);
  },

  getDownload: async (jobId: string): Promise<Job> => {
    return apiRequest(`/downloads/${jobId}`);
  },

  cancelDownload: async (jobId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/downloads/${jobId}/cancel`, {
      method: 'POST',
    });
  },

  pauseDownload: async (jobId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/downloads/${jobId}/pause`, {
      method: 'POST',
    });
  },

  resumeDownload: async (jobId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/downloads/${jobId}/resume`, {
      method: 'POST',
    });
  },

  retryDownload: async (jobId: string): Promise<{ success: boolean }> => {
    return apiRequest(`/downloads/${jobId}/retry`, {
      method: 'POST',
    });
  },

  // Files
  getFileMetadata: async (jobId: string) => {
    return apiRequest(`/files/${jobId}`);
  },

  getDownloadUrl: (jobId: string): string => {
    return `${API_BASE_URL}/files/${jobId}/download`;
  },

  // Health
  getHealth: async () => {
    return apiRequest('/health');
  },
};