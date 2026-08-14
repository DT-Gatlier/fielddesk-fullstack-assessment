import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('Work Orders API', () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'owner@acmefix.com', password: 'Password123!' });
    token = res.body.token;
  });

  it('should create a work order', async () => {
    const res = await request(API_URL)
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        referenceNumber: 'WO-E2E-' + Date.now(),
        title: 'E2E Test Work Order',
        description: 'Testing creation',
        priority: 'HIGH',
        siteName: 'HQ',
      });
      
    expect(res.status).toBe(201);
    expect(res.body.referenceNumber).toContain('WO-E2E-');
  });

  it('should list work orders with pagination', async () => {
    const res = await request(API_URL)
      .get('/work-orders?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);
      
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(5);
  });
});
