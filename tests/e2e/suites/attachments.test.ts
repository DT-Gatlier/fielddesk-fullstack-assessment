import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('Attachments Validation API', () => {
  let token: string;
  let workOrderId: string;
  const tempFilePath = path.join(os.tmpdir(), 'test_attachment.txt');
  const tempImgPath = path.join(os.tmpdir(), 'test_attachment.png');

  beforeAll(async () => {
    const resLogin = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'owner@acmefix.com', password: 'Password123!' });
    token = resLogin.body.token;

    const resWo = await request(API_URL)
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        referenceNumber: 'WO-ATT-' + Date.now(),
        title: 'Attachment Test WO',
        description: 'Test',
        priority: 'LOW',
        siteName: 'Site A',
      });
    workOrderId = resWo.body.id;

    fs.writeFileSync(tempFilePath, 'This is a text file');
    fs.writeFileSync(tempImgPath, 'fake image content');
  });

  afterAll(() => {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    if (fs.existsSync(tempImgPath)) fs.unlinkSync(tempImgPath);
  });

  it('should reject invalid file types', async () => {
    const res = await request(API_URL)
      .post(`/work-orders/${workOrderId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tempFilePath);
      
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid file type');
  });

  it('should accept valid file types (e.g. image/png)', async () => {
    const res = await request(API_URL)
      .post(`/work-orders/${workOrderId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', tempImgPath, { contentType: 'image/png' });
      
    expect(res.status).toBe(201);
    expect(res.body.originalFilename).toBe('test_attachment.png');
  });
});
