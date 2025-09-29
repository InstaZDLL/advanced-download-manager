import { z } from 'zod';

export const CreateDownloadSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  type: z.enum(['auto', 'm3u8', 'file', 'youtube']).default('auto'),
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
});

export type CreateDownloadDto = z.infer<typeof CreateDownloadSchema>;

export const JobActionSchema = z.object({
  action: z.enum(['cancel', 'pause', 'resume', 'retry']),
});

export type JobActionDto = z.infer<typeof JobActionSchema>;