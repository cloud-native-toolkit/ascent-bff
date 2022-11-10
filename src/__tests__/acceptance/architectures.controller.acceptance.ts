import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

/* eslint-disable @typescript-eslint/naming-convention */

describe('Architectures', () => {
  let app: AscentBffApplication;
  let client: Client;
  const testArchitectureId = "arch-test"

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET architectures count', async () => {
    await client
      .get('/architectures/count')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

  it('GET all architectures', async () => {
    await client
      .get('/architectures')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('POST a architecture', async () => {
    await client
      .post('/architectures').send({
        "arch_id": testArchitectureId,
        "name": "string",
        "short_desc": "string",
        "long_desc": "string",
        "public": true,
        "production_ready": true
      })
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('GET architecture by id', async () => {
    await client
      .get(`/architectures/${testArchitectureId}`)
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('PATCH a architecture', async () => {
    await client
      .patch(`/architectures/${testArchitectureId}`).send({
        "short_desc": "short_desc updated"
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{.*"short_desc":"short_desc updated".*}/);
  });

  it('DELETE a architecture', async () => {
    await client
      .delete(`/architectures/${testArchitectureId}`)
      .expect(204);
  });

  it('PATCH all architectures', async () => {
    await client
      .patch(`/architectures`).send({
        "short_desc": "short_desc updated"
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

});
