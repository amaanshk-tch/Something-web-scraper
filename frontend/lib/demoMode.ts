export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@apexresearch.local',
  name: 'Demo Reviewer',
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
};
