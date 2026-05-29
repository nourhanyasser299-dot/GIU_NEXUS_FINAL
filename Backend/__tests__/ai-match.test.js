const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

const TOKEN = jwt.sign({ id: 'test-user-1', role: 'seeker' }, process.env.JWT_SECRET);
const withAuth = (req) => req.set('Authorization', 'Bearer ' + TOKEN);

let nextResponse;

beforeEach(() => {
  nextResponse = { ok: true, status: 200, body: [] };
  global.fetch = jest.fn(async () => ({
    ok: nextResponse.ok,
    status: nextResponse.status,
    text: async () => JSON.stringify(nextResponse.body)
  }));
});

afterEach(() => {
  delete global.fetch;
});

describe('POST /api/ai/match', () => {
  const cvText = 'Built React + Node.js dashboards with Postgres. AWS Lambda experience.';
  const jobs = [
    { id: 'job-react', title: 'Senior React Engineer', description: 'React, TypeScript, Node.js team', requirements: ['React', 'TypeScript', 'Node.js'] },
    { id: 'job-py',    title: 'Data Scientist',         description: 'Python, pandas, scikit-learn',     requirements: ['Python', 'pandas'] }
  ];

  it('401s without an Authorization header', async () => {
    const res = await request(app).post('/api/ai/match').send({ cvText, jobs });
    expect(res.status).toBe(401);
  });

  it('400s when cvText is missing', async () => {
    const res = await withAuth(request(app).post('/api/ai/match')).send({ jobs });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cvText/);
  });

  it('400s when jobs is missing or empty', async () => {
    const r1 = await withAuth(request(app).post('/api/ai/match')).send({ cvText });
    expect(r1.status).toBe(400);
    const r2 = await withAuth(request(app).post('/api/ai/match')).send({ cvText, jobs: [] });
    expect(r2.status).toBe(400);
  });

  it('400s when a job is missing id or description', async () => {
    const res = await withAuth(request(app).post('/api/ai/match')).send({
      cvText,
      jobs: [{ id: 'x' }]
    });
    expect(res.status).toBe(400);
  });

  it('returns one match per job, scored 0–100, with missingRequirements', async () => {
    nextResponse = { ok: true, status: 200, body: [0.84, 0.12] };
    const res = await withAuth(request(app).post('/api/ai/match')).send({ cvText, jobs });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('huggingface');
    expect(res.body.data.matches).toHaveLength(2);

    const [m1, m2] = res.body.data.matches;
    expect(m1.jobId).toBe('job-react');
    expect(m1.score).toBe(84);
    // Job 1 requires React, TypeScript, Node.js. CV mentions React + Node.js
    // → only TypeScript missing.
    expect(m1.missingRequirements).toEqual(['TypeScript']);

    expect(m2.jobId).toBe('job-py');
    expect(m2.score).toBe(12);
    // Job 2 requires Python + pandas. Neither is in the CV.
    expect(m2.missingRequirements).toEqual(['Python', 'pandas']);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/sentence-transformers\/all-MiniLM-L6-v2/);
    const body = JSON.parse(opts.body);
    expect(body.inputs.source_sentence).toBe(cvText);
    expect(body.inputs.sentences).toHaveLength(2);
  });

  it('falls back to local Jaccard scoring when HF returns 5xx', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'Model loading' })
    }));
    const res = await withAuth(request(app).post('/api/ai/match')).send({ cvText, jobs });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('jaccard');
    expect(res.body.data.matches).toHaveLength(2);
    // CV ↔ React job should outscore CV ↔ Python job under any sane overlap metric.
    const reactMatch  = res.body.data.matches.find((m) => m.jobId === 'job-react');
    const pythonMatch = res.body.data.matches.find((m) => m.jobId === 'job-py');
    expect(reactMatch.score).toBeGreaterThan(pythonMatch.score);
  });

  it('clamps the score to 0 when HF returns negative similarity', async () => {
    nextResponse = { ok: true, status: 200, body: [-0.42] };
    const res = await withAuth(request(app).post('/api/ai/match')).send({
      cvText, jobs: [jobs[0]]
    });
    expect(res.status).toBe(200);
    expect(res.body.data.matches[0].score).toBe(0);
  });

  it('rejects more than 20 jobs', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `j${i}`, description: 'x'
    }));
    const res = await withAuth(request(app).post('/api/ai/match')).send({ cvText, jobs: many });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/max 20/);
  });
});
