import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('Authentication API', () => {
  it('should reject invalid credentials', async () => {
    const res = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'nonexistent@acmefix.com', password: 'wrong' });
      
    expect(res.status).toBe(401);
  });

  it('should login owner successfully', async () => {
    const res = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'owner@acmefix.com', password: 'Password123!' });
      
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('OWNER');
  });
});
