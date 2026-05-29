const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');

beforeAll(async () => {
  await db.connect();
});

afterEach(async () => {
  await db.clear();
});

afterAll(async () => {
  await db.disconnect();
});

const seekerPayload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'analytical-engine',
  role: 'seeker'
};

describe('POST /api/auth/register', () => {
  it('registers a seeker and returns a JWT + user (201)', async () => {
    const res = await request(app).post('/api/auth/register').send(seekerPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toMatchObject({
      name: seekerPayload.name,
      email: seekerPayload.email,
      role: 'seeker'
    });
    // Password must never be returned.
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(seekerPayload).expect(201);
    const res = await request(app).post('/api/auth/register').send(seekerPayload);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects an invalid role with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      ...seekerPayload,
      role: 'admin'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a too-short password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      ...seekerPayload,
      password: 'short'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(seekerPayload).expect(201);
  });

  it('returns a JWT for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: seekerPayload.email, password: seekerPayload.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: seekerPayload.email, password: 'definitely-wrong' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for unknown email (does not leak existence)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'analytical-engine' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user when given a valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send(seekerPayload)
      .expect(201);
    const token = reg.body.data.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(seekerPayload.email);
  });

  it('rejects malformed tokens with 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});
