import type { JobDetail, JobSummary, SearchPayload } from './types';

const jobs = new Map<string, JobDetail>();

const sampleSources = (topic: string, keywords: string[], depth: number) =>
  Array.from({ length: Math.min(depth, 8) }, (_, index) => ({
    id: `demo-result-${index + 1}`,
    title: `${topic}: market signal ${index + 1}`,
    sourceUrl: `https://example.com/research/${index + 1}`,
    snippet: `A demonstration source for ${topic}. ${keywords.length ? `Relevant terms include ${keywords.join(', ')}.` : 'No additional keyword filter was supplied.'}`,
    sentiment: index % 3 === 0 ? 'Positive' : index % 3 === 1 ? 'Neutral' : 'Negative',
    mentions: Math.max(1, keywords.length + (index % 4)),
  }));

export function createDemoJob(payload: SearchPayload): string {
  const id = `demo-job-${Date.now()}`;
  const results = sampleSources(payload.topic, payload.keywords, payload.depth);
  const job: JobDetail = {
    id,
    topic: payload.topic,
    keywords: payload.keywords,
    depth: payload.depth,
    status: 'PENDING',
    errorMessage: null,
    bullets: [],
    sentimentData: { Positive: 3, Neutral: 3, Negative: 2 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    results,
    liveResultsOnly: true,
  };
  jobs.set(id, job);

  window.setTimeout(() => updateDemoJob(id, 'PROCESSING'), 500);
  window.setTimeout(() => {
    const current = jobs.get(id);
    if (!current) return;
    current.status = 'COMPLETED';
    current.updatedAt = new Date().toISOString();
    current.bullets = [
      `${payload.topic} shows a mixed but actionable source landscape.`,
      `The strongest recurring signals appear around ${payload.keywords[0] || 'market adoption and execution'}.`,
      'The source set is intentionally synthetic so the interface can be reviewed without external services.',
    ];
    jobs.set(id, current);
  }, 2200);

  return id;
}

function updateDemoJob(id: string, status: JobDetail['status']) {
  const current = jobs.get(id);
  if (!current) return;
  current.status = status;
  current.updatedAt = new Date().toISOString();
  jobs.set(id, current);
}

export function getDemoJob(id: string): JobDetail | null {
  return jobs.get(id) ?? null;
}

export function listDemoJobs(): JobSummary[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((job) => ({
      id: job.id,
      topic: job.topic,
      keywords: job.keywords,
      depth: job.depth,
      status: job.status,
      sentimentData: job.sentimentData,
      bullets: job.bullets,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      _count: { results: job.results.length },
    }));
}
