export interface Job {
  jobId: string;
  url: string;
  type: 'auto' | 'm3u8' | 'file' | 'youtube' | 'twitter';
  status: 'queued' | 'running' | 'paused' | 'failed' | 'completed' | 'cancelled';
  stage?: 'queue' | 'download' | 'merge' | 'transcode' | 'finalize' | 'completed';
  progress: number;
  speed?: string;
  eta?: number;
  totalBytes?: string;
  filename?: string;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface CreateDownloadRequest {
  url: string;
  type?: 'auto' | 'm3u8' | 'file' | 'youtube' | 'twitter';
  headers?: {
    ua?: string;
    referer?: string;
    extra?: Record<string, string>;
  };
  transcode?: {
    to?: string;
    codec?: string;
    crf?: number;
  };
  filenameHint?: string;
  twitter?: {
    tweetId?: string;
    username?: string;
    mediaType?: 'images' | 'videos' | 'all';
    includeRetweets?: boolean;
    maxTweets?: number;
  };
}

export interface CreateDownloadResponse {
  jobId: string;
}

export interface JobListResponse {
  jobs: Job[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ProgressEvent {
  jobId: string;
  stage: 'queue' | 'download' | 'merge' | 'transcode' | 'finalize';
  progress: number;
  speed?: string;
  eta?: number;
  totalBytes?: number;
}

export interface LogEvent {
  jobId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface CompletedEvent {
  jobId: string;
  filename: string;
  size: number;
  outputPath: string;
}

export interface FailedEvent {
  jobId: string;
  errorCode: string;
  message: string;
}