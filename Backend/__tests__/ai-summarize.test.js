const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

const TOKEN = jwt.sign({ id: 'test-user-1', role: 'seeker' }, process.env.JWT_SECRET);
const withAuth = (req) => req.set('Authorization', 'Bearer ' + TOKEN);

let nextResponse;

beforeEach(() => {
  nextResponse = { ok: true, status: 200, body: [{ summary_text: 'A short summary.' }] };
  global.fetch = jest.fn(async () => ({
    ok: nextResponse.ok,
    status: nextResponse.status,
    text: async () => JSON.stringify(nextResponse.body)
  }));
});

afterEach(() => {
  delete global.fetch;
});

const longText = (
  'We are hiring a senior software engineer to lead our distributed-systems team. ' +
  'You will design, build, and operate the next generation of our streaming data ' +
  'platform that processes billions of events per day across the globe. ' +
  'Required: 5+ years of backend experience, deep familiarity with Kubernetes, ' +
  'and a track record of shipping production systems written in Go or Rust. ' +
  'You will collaborate with product, design, and other engineering teams to ' +
  'define the technical roadmap and make sure the platform is reliable, fast, ' +
  'observable, and easy to operate at scale.'
);

describe('POST /api/ai/summarize', () => {
  it('401s without an Authorization header', async () => {
    const res = await request(app).post('/api/ai/summarize').send({ text: 'hi' });
    expect(res.status).toBe(401);
  });

  it('400s when text is missing', async () => {
    const res = await withAuth(request(app).post('/api/ai/summarize')).send({});
    expect(res.status).toBe(400);
  });

  it('400s when text is an empty string', async () => {
    const res = await withAuth(request(app).post('/api/ai/summarize')).send({ text: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns the HF summary on the happy path and posts correct parameters', async () => {
    const res = await withAuth(request(app).post('/api/ai/summarize'))
      .send({ text: longText, minLength: 30, maxLength: 80 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('huggingface');
    expect(res.body.data.summary).toBe('A short summary.');
    expect(res.body.data.model).toMatch(/distilbart-cnn-12-6/);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/sshleifer\/distilbart-cnn-12-6/);
    const body = JSON.parse(opts.body);
    expect(typeof body.inputs).toBe('string');
    expect(body.parameters).toBeDefined();
    expect(body.parameters.min_length).toBe(30);
    expect(body.parameters.max_length).toBe(80);
    expect(body.parameters.do_sample).toBe(false);
  });

  it('accepts the non-array HF response shape { summary_text }', async () => {
    nextResponse = { ok: true, status: 200, body: { summary_text: 'Alt shape summary.' } };
    const res = await withAuth(request(app).post('/api/ai/summarize')).send({ text: longText });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('huggingface');
    expect(res.body.data.summary).toBe('Alt shape summary.');
  });

  it('falls back to extractive when HF returns 5xx', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'Model loading' })
    }));
    const res = await withAuth(request(app).post('/api/ai/summarize')).send({ text: longText });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('extractive');
    expect(res.body.data.summary.length).toBeGreaterThan(0);
    // Extractive keeps the first sentence verbatim.
    expect(res.body.data.summary).toMatch(/^We are hiring a senior software engineer/);
  });

  it('skips HF and returns extractive for very short input', async () => {
    const res = await withAuth(request(app).post('/api/ai/summarize')).send({ text: 'Short.' });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('extractive');
    expect(res.body.data.summary).toBe('Short.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('clamps min/max parameters into a sane range', async () => {
    await withAuth(request(app).post('/api/ai/summarize'))
      .send({ text: longText, minLength: 5, maxLength: 9999 });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.parameters.min_length).toBeGreaterThanOrEqual(20);
    expect(body.parameters.max_length).toBeLessThanOrEqual(220);
    expect(body.parameters.max_length).toBeGreaterThan(body.parameters.min_length);
  });
});
