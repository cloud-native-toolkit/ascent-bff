import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

describe('Profiles', () => {
  let app: AscentBffApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET profile count', async () => {
    await client
      .get('/mapping/profiles/count')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/)
  });

  it('GET all profile', async () => {
    await client
      .get('/mapping/profiles')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

});
