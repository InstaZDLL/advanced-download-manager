import { z } from 'zod';

export const CreateDownloadSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  type: z.enum(['auto', 'm3u8', 'file', 'youtube', 'twitter', 'pinterest']).default('auto'),
  headers: z.object({
    ua: z.string().optional(),
    referer: z.string().url().optional(),
    extra: z.record(z.string()).optional(),
  }).optional(),
  transcode: z.object({
    to: z.string().default('mp4'),
    codec: z.string().default('h264'),
    crf: z.number().min(1).max(51).default(23),
  }).optional(),
  filenameHint: z.string().optional(),
  twitter: z.object({
    tweetId: z.string().optional(),
    username: z.string().optional(),
    mediaType: z.enum(['images', 'videos', 'all']).default('all'),
    includeRetweets: z.boolean().default(false),
    maxTweets: z.number().min(1).max(200).default(50),
  }).optional(),
  pinterest: z.object({
    maxImages: z.number().min(1).max(500).default(100),
    includeVideos: z.boolean().default(false),
    resolution: z.string().regex(/^\d+x\d+$/).optional(), // Format: WIDTHxHEIGHT
  }).optional(),
});

export type CreateDownloadDto = z.infer<typeof CreateDownloadSchema>;

export const JobActionSchema = z.object({
  action: z.enum(['cancel', 'pause', 'resume', 'retry']),
});

export type JobActionDto = z.infer<typeof JobActionSchema>;