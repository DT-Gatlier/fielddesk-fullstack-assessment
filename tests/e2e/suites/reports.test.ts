import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('Reports (CSV Export) API', () => {
  let ownerToken: string;
  let techToken: string;

  beforeAll(async () => {
    const resOwner = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'owner@acmefix.com', password: 'Password123!' });
    ownerToken = resOwner.body.token;

    const resTech = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'tech@acmefix.com', password: 'Password123!' });
    techToken = resTech.body.token;
  });

  it('should deny TECHNICIAN access to CSV export', async () => {
    const res = await request(API_URL)
      .get('/reports/work-orders/csv')
      .set('Authorization', `Bearer ${techToken}`);
      
    expect(res.status).toBe(403);
  });

  it('should allow OWNER to export CSV', async () => {
    const res = await request(API_URL)
      .get('/reports/work-orders/csv')
      .set('Authorization', `Bearer ${ownerToken}`);
      
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Reference Number,Title,Status,Priority,Site Name,Assigned Technician,Scheduled Start,Scheduled End,Created At');
  });
});
