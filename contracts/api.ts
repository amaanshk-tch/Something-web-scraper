export interface User {
  id: string;
  email: string;
  name?: string | null;
  createdAt?: string;
}

export type JobStatus =
  | 'QUEUED'
  | 'PLANNING'
  | 'SEARCHING'
  | 'FETCHING'
  | 'ANALYZING'
  | 'SYNTHESIZING'
  | 'GENERATING_REPORT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

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
  publisher?: string;
  published?: string;
  relevance?: number;
  evidence?: string;
  claims?: string[];
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

export interface JobStreamUpdate {
  status: JobStatus;
  progress: number;
  message: string;
}

export interface JobDetail extends JobSummary {
  liveResultsOnly: boolean;
  progress?: number;
  message?: string;
  results: ResultItem[];
}

export interface ConceptItem {
  canonical: string;
  aliases?: string[];
  conceptType?: string;
  confidence?: number;
}

export interface SearchPayload {
  topic: string;
  keywords: string[];
  concepts?: ConceptItem[];
  depth: number;
}

export interface JobCreateResponse {
  message: string;
  jobId: string;
  status: JobStatus;
}

export interface ReportJobCreateResponse {
  message: string;
  reportJobId: string;
  status: JobStatus;
  reportUrl?: string;
}

export interface JobsPageResponse {
  jobs: JobSummary[];
  nextCursor: string | null;
}

export interface JobEvent {
  jobId: string;
  timestamp: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  requestId?: string;
}

export interface ApiErrorResponse {
  error: ApiErrorShape;
}

export interface AuthResponse {
  user: User;
}
