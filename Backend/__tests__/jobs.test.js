const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');
const RecruiterProfile = require('../src/models/RecruiterProfile');

beforeAll(async () => {
  await db.connect();
});

afterEach(async () => {
  await db.clear();
});

afterAll(async () => {
  await db.disconnect();
});

const recruiterPayload = {
  name: 'Grace Hopper',
  email: 'grace@example.com',
  password: 'compiler-1952',
  role: 'recruiter',
  company: 'Vertex AI'
};

const seekerPayload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'analytical-engine',
  role: 'seeker'
};

const validJob = {
  title: 'Senior Frontend Engineer',
  company: 'Vertex AI',
  location: 'Cairo',
  type: 'remote',
  description: 'Build delightful interfaces.',
  requirements: ['React', 'TypeScript']
};

async function registerRecruiter({ approve = false } = {}) {
  const reg = await request(app)
    .post('/api/auth/register')
    .send(recruiterPayload)
    .expect(201);
  if (approve) {
    await RecruiterProfile.updateOne(
      { user: reg.body.data.user.id },
      { $set: { approvalStatus: 'approved', approvedAt: new Date() } }
    );
  }
  return reg.body.data.token;
}

async function registerSeeker() {
  const reg = await request(app)
    .post('/api/auth/register')
    .send(seekerPayload)
    .expect(201);
  return reg.body.data.token;
}

describe('GET /api/jobs', () => {
  it('returns an empty list and pagination on a fresh DB', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.jobs)).toBe(true);
    expect(res.body.data.jobs).toHaveLength(0);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 0,
      pages: 0
    });
  });

  it('rejects limit > 50 with 400', async () => {
    const res = await request(app).get('/api/jobs').query({ limit: 999 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/jobs', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/jobs').send(validJob);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a seeker token', async () => {
    const token = await registerSeeker();
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(validJob);
    expect(res.status).toBe(403);
  });

  it('returns 403 for an unapproved recruiter (pending approval)', async () => {
    const token = await registerRecruiter({ approve: false });
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(validJob);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/pending approval/i);
  });

  it('creates a job for an approved recruiter (201)', async () => {
    const token = await registerRecruiter({ approve: true });
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(validJob);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      title: validJob.title,
      company: validJob.company,
      type: 'remote',
      status: 'active',
      applicantCount: 0
    });
    expect(res.body.data.postedBy).toBeDefined();

    const list = await request(app).get('/api/jobs');
    expect(list.body.data.jobs).toHaveLength(1);
    expect(list.body.data.pagination.total).toBe(1);
  });

  it('rejects invalid job type with 400', async () => {
    const token = await registerRecruiter({ approve: true });
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validJob, type: 'contract' });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 400', async () => {
    const token = await registerRecruiter({ approve: true });
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Vertex AI' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 404 for a missing job', async () => {
    const res = await request(app).get('/api/jobs/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});
