import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

describe('Nists', () => {
  let app: AscentBffApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET nist count', async () => {
    await client
      .get('/nist/count')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/)
  });

  it('GET all nist', async () => {
    await client
      .get('/nist')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

});
