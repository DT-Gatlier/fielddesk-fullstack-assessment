import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('Roles and Cross-Org Isolation API', () => {
  let orgATokenOwner: string;
  let orgATokenTech: string;
  let orgBTokenOwner: string;
  let orgAWorkOrderId: string;

  beforeAll(async () => {
    // Org A Owner
    const resAOwner = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'owner@acmefix.com', password: 'Password123!' });
    orgATokenOwner = resAOwner.body.token;

    // Org A Technician
    const resATech = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'tech@acmefix.com', password: 'Password123!' });
    orgATokenTech = resATech.body.token;

    // Org B Owner
    const resBOwner = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'owner@techserve.com', password: 'Password123!' });
    orgBTokenOwner = resBOwner.body.token;
  });

  it('should allow OWNER to create a work order', async () => {
    const res = await request(API_URL)
      .post('/work-orders')
      .set('Authorization', `Bearer ${orgATokenOwner}`)
      .send({
        referenceNumber: 'WO-ROLE-' + Date.now(),
        title: 'Role Test WO',
        description: 'Test',
        priority: 'LOW',
        siteName: 'Site A',
      });
      
    expect(res.status).toBe(201);
    orgAWorkOrderId = res.body.id;
  });

  it('should deny TECHNICIAN from creating a work order', async () => {
    const res = await request(API_URL)
      .post('/work-orders')
      .set('Authorization', `Bearer ${orgATokenTech}`)
      .send({
        referenceNumber: 'WO-TECH-' + Date.now(),
        title: 'Tech Test WO',
        description: 'Test',
        priority: 'LOW',
        siteName: 'Site B',
      });
      
    expect(res.status).toBe(403);
  });

  it('should deny cross-org access to work orders', async () => {
    // Org B Owner tries to fetch Org A's work order
    const res = await request(API_URL)
      .get(`/work-orders/${orgAWorkOrderId}`)
      .set('Authorization', `Bearer ${orgBTokenOwner}`);
      
    expect(res.status).toBe(404);
  });
});
