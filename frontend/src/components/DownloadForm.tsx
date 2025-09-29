import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import type { CreateDownloadRequest } from '@/types';

interface DownloadFormProps {
  onJobCreated: (jobId: string) => void;
}

export function DownloadForm({ onJobCreated }: DownloadFormProps) {
  const [formData, setFormData] = useState<CreateDownloadRequest>({
    url: '',
    type: 'auto',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const createDownloadMutation = useMutation({
    mutationFn: api.createDownload,
    onSuccess: (response) => {
      onJobCreated(response.jobId);
      setFormData({ url: '', type: 'auto' });
      setShowAdvanced(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.url.trim()) return;

    createDownloadMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof CreateDownloadRequest, value: string | CreateDownloadRequest[keyof CreateDownloadRequest]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* URL Input */}
      <div>
        <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
          Download URL *
        </label>
        <input
          type="url"
          id="url"
          value={formData.url}
          onChange={(e) => handleInputChange('url', e.target.value)}
          placeholder="https://example.com/file.zip"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      {/* Type Selection */}
      <div>
        <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
          Download Type
        </label>
        <select
          id="type"
          value={formData.type}
          onChange={(e) => handleInputChange('type', e.target.value as CreateDownloadRequest['type'])}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="auto">Auto Detect</option>
          <option value="youtube">YouTube/Video</option>
          <option value="m3u8">HLS Stream (M3U8)</option>
          <option value="file">Direct File</option>
        </select>
      </div>

      {/* Advanced Options Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showAdvanced ? '▼' : '▶'} Advanced Options
        </button>
      </div>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-md">
          {/* Filename Hint */}
          <div>
            <label htmlFor="filenameHint" className="block text-sm font-medium text-gray-700 mb-1">
              Custom Filename (optional)
            </label>
            <input
              type="text"
              id="filenameHint"
              value={formData.filenameHint || ''}
              onChange={(e) => handleInputChange('filenameHint', e.target.value)}
              placeholder="my-download"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Headers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="userAgent" className="block text-sm font-medium text-gray-700 mb-1">
                User Agent
              </label>
              <input
                type="text"
                id="userAgent"
                value={formData.headers?.ua || ''}
                onChange={(e) =>
                  handleInputChange('headers', { ...formData.headers, ua: e.target.value })
                }
                placeholder="Mozilla/5.0..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="referer" className="block text-sm font-medium text-gray-700 mb-1">
                Referer
              </label>
              <input
                type="url"
                id="referer"
                value={formData.headers?.referer || ''}
                onChange={(e) =>
                  handleInputChange('headers', { ...formData.headers, referer: e.target.value })
                }
                placeholder="https://example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Transcode Options */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Transcode Options</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="transcodeFormat" className="block text-xs text-gray-600 mb-1">
                  Format
                </label>
                <select
                  id="transcodeFormat"
                  value={formData.transcode?.to || ''}
                  onChange={(e) =>
                    handleInputChange('transcode', { ...formData.transcode, to: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No transcode</option>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="avi">AVI</option>
                </select>
              </div>

              <div>
                <label htmlFor="transcodeCodec" className="block text-xs text-gray-600 mb-1">
                  Codec
                </label>
                <select
                  id="transcodeCodec"
                  value={formData.transcode?.codec || 'h264'}
                  onChange={(e) =>
                    handleInputChange('transcode', { ...formData.transcode, codec: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!formData.transcode?.to}
                >
                  <option value="h264">H.264</option>
                  <option value="h265">H.265</option>
                </select>
              </div>

              <div>
                <label htmlFor="transcodeCrf" className="block text-xs text-gray-600 mb-1">
                  Quality (CRF)
                </label>
                <input
                  type="number"
                  id="transcodeCrf"
                  min="1"
                  max="51"
                  value={formData.transcode?.crf || 23}
                  onChange={(e) =>
                    handleInputChange('transcode', {
                      ...formData.transcode,
                      crf: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!formData.transcode?.to}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={createDownloadMutation.isPending || !formData.url.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createDownloadMutation.isPending ? 'Adding...' : 'Add Download'}
        </button>
      </div>

      {/* Error Display */}
      {createDownloadMutation.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">
            Error: {createDownloadMutation.error.message}
          </p>
        </div>
      )}
    </form>
  );
}