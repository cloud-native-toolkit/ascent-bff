import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

/* eslint-disable @typescript-eslint/naming-convention */

describe('Controls', () => {
  let app: AscentBffApplication;
  let client: Client;
  const testControlId = "TEST-1"

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET controls count', async () => {
    await client
      .get('/controls/count')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/)
  });

  it('GET all controls', async () => {
    await client
      .get('/controls')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('POST a control', async () => {
    await client
      .post('/controls').send({
        "id": testControlId,
        "name": "test name",
      })
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('GET control by id', async () => {
    await client
      .get(`/controls/${testControlId}`)
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('PATCH a control', async () => {
    await client
      .patch(`/controls/${testControlId}`).send({
        "name": "test name updated"
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{.*"name":"test name updated".*}/);
  });

  it('DELETE a control', async () => {
    await client
      .delete(`/controls/${testControlId}`)
      .expect(204);
  });

  it('PATCH all controls', async () => {
    await client
      .patch(`/controls`).send({
        "base_control": true
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

});
