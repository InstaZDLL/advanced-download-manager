import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { CreateDownloadRequest } from '@/types';

interface DownloadFormProps {
  onJobCreated: (jobId: string) => void;
}

// Detect Twitter/X URLs
function detectTwitterUrl(url: string): boolean {
  return /(?:twitter\.com|x\.com)\//i.test(url);
}

// Extract tweet ID from URL
function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
  return match?.[1] ?? null;
}

// Extract username from URL
function extractUsername(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/]+)(?:\/)?$/);
  return match?.[1] ?? null;
}

export function DownloadForm({ onJobCreated }: DownloadFormProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateDownloadRequest>({
    url: '',
    type: 'auto',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-detect Twitter URLs and update type
  useEffect(() => {
    if (formData.url && detectTwitterUrl(formData.url)) {
      if (formData.type === 'auto') {
        setFormData(prev => ({ ...prev, type: 'twitter' }));
      }

      // Auto-populate Twitter options
      const tweetId = extractTweetId(formData.url);
      const username = extractUsername(formData.url);

      if (tweetId || username) {
        setFormData(prev => ({
          ...prev,
          twitter: {
            ...(prev.twitter || {}),
            ...(tweetId ? { tweetId } : {}),
            ...(username ? { username } : {}),
          }
        }));
      }
    }
  }, [formData.url, formData.type]);

  const createDownloadMutation = useMutation({
    mutationFn: api.createDownload,
    onSuccess: (response) => {
      onJobCreated(response.jobId);
      setFormData({ url: '', type: 'auto' });
      setShowAdvanced(false);

      // Immediately refetch downloads list
      queryClient.invalidateQueries({ queryKey: ['downloads'] });

      // Show success message
      setSuccessMessage(`Download added successfully! (ID: ${response.jobId.slice(0, 8)}...)`);
      setTimeout(() => setSuccessMessage(null), 3000);
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
          <option value="twitter">Twitter/X Media</option>
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

          {/* Twitter Options */}
          {formData.type === 'twitter' && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Twitter Options</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="twitterMediaType" className="block text-xs text-gray-600 mb-1">
                    Media Type
                  </label>
                  <select
                    id="twitterMediaType"
                    value={formData.twitter?.mediaType || 'all'}
                    onChange={(e) =>
                      handleInputChange('twitter', { ...formData.twitter, mediaType: e.target.value as 'images' | 'videos' | 'all' })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">Images & Videos</option>
                    <option value="images">Images Only</option>
                    <option value="videos">Videos Only</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="twitterMaxTweets" className="block text-xs text-gray-600 mb-1">
                    Max Tweets (for users)
                  </label>
                  <input
                    type="number"
                    id="twitterMaxTweets"
                    min="1"
                    max="200"
                    value={formData.twitter?.maxTweets || 50}
                    onChange={(e) =>
                      handleInputChange('twitter', {
                        ...formData.twitter,
                        maxTweets: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="mt-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.twitter?.includeRetweets || false}
                    onChange={(e) =>
                      handleInputChange('twitter', {
                        ...formData.twitter,
                        includeRetweets: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-600">Include retweets</span>
                </label>
              </div>
            </div>
          )}

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

      {/* Success Message */}
      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-600">
            ✓ {successMessage}
          </p>
        </div>
      )}

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