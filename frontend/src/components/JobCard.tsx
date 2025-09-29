import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Job } from '@/types';

interface JobCardProps {
  job: Job;
  isActive: boolean;
  onUpdate: () => void;
}

export function JobCard({ job, isActive, onUpdate }: JobCardProps) {
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelDownload(job.jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      onUpdate();
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseDownload(job.jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.resumeDownload(job.jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'queued':
        return 'bg-yellow-100 text-yellow-800';
      case 'paused':
        return 'bg-gray-100 text-gray-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'youtube':
        return '🎥';
      case 'm3u8':
        return '📺';
      case 'file':
        return '📄';
      default:
        return '📥';
    }
  };

  const formatBytes = (bytes?: string) => {
    if (!bytes) return '';
    const size = parseInt(bytes);
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = size;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatETA = (eta?: number) => {
    if (!eta) return '';
    if (eta < 60) return `${eta}s`;
    if (eta < 3600) return `${Math.floor(eta / 60)}m ${eta % 60}s`;
    return `${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m`;
  };

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url.length > 60 ? `${url.substring(0, 60)}...` : url;
    }
  };

  return (
    <div className={`p-6 ${isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}>
      <div className="flex items-start justify-between">
        {/* Job Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3 mb-2">
            <span className="text-lg">{getTypeIcon(job.type)}</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}
            >
              {job.status.toUpperCase()}
            </span>
            {job.stage && job.status === 'running' && (
              <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                {job.stage}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">
              {job.filename || formatUrl(job.url)}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {job.url}
            </p>
          </div>

          {/* Progress Bar */}
          {(job.status === 'running' || job.status === 'paused') && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600">
                  {job.progress.toFixed(1)}%
                </span>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  {job.speed && <span>{job.speed}</span>}
                  {job.eta && <span>ETA: {formatETA(job.eta)}</span>}
                  {job.totalBytes && <span>{formatBytes(job.totalBytes)}</span>}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {job.status === 'failed' && job.errorMessage && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {job.errorMessage}
            </div>
          )}

          {/* Completed Info */}
          {job.status === 'completed' && (
            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
              {job.totalBytes && <span>Size: {formatBytes(job.totalBytes)}</span>}
              <span>Completed: {new Date(job.updatedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2 ml-4">
          {job.status === 'running' && (
            <>
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="px-3 py-1 text-xs text-yellow-700 bg-yellow-100 rounded hover:bg-yellow-200 disabled:opacity-50"
              >
                Pause
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="px-3 py-1 text-xs text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {job.status === 'paused' && (
            <>
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="px-3 py-1 text-xs text-green-700 bg-green-100 rounded hover:bg-green-200 disabled:opacity-50"
              >
                Resume
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="px-3 py-1 text-xs text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {job.status === 'queued' && (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="px-3 py-1 text-xs text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          {job.status === 'completed' && (
            <a
              href={api.getDownloadUrl(job.jobId)}
              download
              className="px-3 py-1 text-xs text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
            >
              Download
            </a>
          )}

          {job.status === 'failed' && (
            <button
              onClick={() => {
                // TODO: Implement retry functionality
                console.warn('Retry job:', job.jobId);
              }}
              className="px-3 py-1 text-xs text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Job ID for debugging */}
      <div className="mt-2 text-xs text-gray-400">
        ID: {job.jobId}
      </div>
    </div>
  );
}