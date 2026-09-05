export interface User {
  id: string;
  email: string;
  name?: string | null;
  createdAt?: string;
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface JobMeta {
  liveResultsOnly?: boolean;
  depthRequested?: number;
  resultsFound?: number;
}

export type SentimentData = Record<string, number> & {
  _meta?: JobMeta;
};

export interface ResultItem {
  id: string;
  sourceUrl: string;
  title: string;
  snippet: string;
  sentiment: string;
  mentions: number;
  createdAt?: string;
}

export interface JobSummary {
  id: string;
  topic: string;
  keywords: string[];
  depth: number;
  status: JobStatus;
  sentimentData: SentimentData | null;
  bullets: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    results: number;
  };
}

export interface JobDetail extends JobSummary {
  liveResultsOnly: boolean;
  results: ResultItem[];
}

export interface SearchPayload {
  topic: string;
  keywords: string[];
  depth: number;
}

export interface JobCreateResponse {
  message: string;
  jobId: string;
  status: JobStatus;
}

export interface JobsPageResponse {
  jobs: JobSummary[];
  nextCursor: string | null;
}

export interface AuthResponse {
  user: User;
}
