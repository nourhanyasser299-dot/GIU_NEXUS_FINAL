const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

// JWT for a fake authenticated seeker. The auth middleware only checks the
// signature, so a synthetic user is fine for endpoint-level tests.
const TOKEN = jwt.sign({ id: 'test-user-1', role: 'seeker' }, process.env.JWT_SECRET);
const withAuth = (req) => req.set('Authorization', 'Bearer ' + TOKEN);

// Mock the global fetch so tests never hit Hugging Face. Each test sets the
// next response before triggering the request.
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

describe('POST /api/ai/skills/extract', () => {
  it('401s without an Authorization header', async () => {
    const res = await request(app).post('/api/ai/skills/extract').send({ text: 'hi' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('400s when text is missing', async () => {
    const res = await withAuth(request(app).post('/api/ai/skills/extract')).send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400s when text is the empty string', async () => {
    const res = await withAuth(request(app).post('/api/ai/skills/extract')).send({ text: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns deduped, in-order skills from the HF token-classification response', async () => {
    const text = 'Built React apps with Node.js. Strong in React and Postgres.';
    // Quick sanity check on the offsets we feed the mock — keeps this test
    // honest if someone tweaks the input string.
    expect(text.slice(6, 11)).toBe('React');
    expect(text.slice(22, 29)).toBe('Node.js');
    expect(text.slice(41, 46)).toBe('React');
    expect(text.slice(51, 59)).toBe('Postgres');
    nextResponse = {
      ok: true,
      status: 200,
      body: [
        { entity_group: 'SKILL', start: 6, end: 11 },   // "React"
        { entity_group: 'SKILL', start: 22, end: 29 },  // "Node.js"
        { entity_group: 'SKILL', start: 41, end: 46 },  // "React" — duplicate
        { entity_group: 'SKILL', start: 51, end: 59 }   // "Postgres"
      ]
    };

    const res = await withAuth(request(app).post('/api/ai/skills/extract')).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('huggingface');
    expect(res.body.data.skills).toEqual(['React', 'Node.js', 'Postgres']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = global.fetch.mock.calls[0];
    expect(calledUrl).toMatch(/router\.huggingface\.co\/hf-inference\/models\//);
    expect(JSON.parse(calledOpts.body)).toMatchObject({ inputs: text });
  });

  it('falls back to the heuristic extractor when both HF models error out', async () => {
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      // Both the primary and fallback model 503.
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: `Model ${call} loading` })
      };
    });

    const text = 'Senior engineer with deep React, Node, and AWS experience.';
    const res = await withAuth(request(app).post('/api/ai/skills/extract')).send({ text });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('heuristic');
    expect(res.body.data.skills).toEqual(expect.arrayContaining(['react', 'node', 'aws']));
    // Two HF calls: primary then fallback.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('attaches the bearer header when HF_API_TOKEN is set', async () => {
    process.env.HF_API_TOKEN = 'hf_test_token_123';
    nextResponse = { ok: true, status: 200, body: [] };
    await withAuth(request(app).post('/api/ai/skills/extract')).send({ text: 'Hello world.' });
    delete process.env.HF_API_TOKEN;

    expect(global.fetch).toHaveBeenCalled();
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer hf_test_token_123');
  });

  it('caps very long input to keep the upstream call bounded', async () => {
    const huge = 'a'.repeat(20000);
    await withAuth(request(app).post('/api/ai/skills/extract')).send({ text: huge });
    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    // Service caps to 8000 characters before sending upstream.
    expect(body.inputs.length).toBeLessThanOrEqual(8000);
  });
});
