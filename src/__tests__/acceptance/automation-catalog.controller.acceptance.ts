import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

describe('Automation Catalog', () => {
  let app: AscentBffApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET the automation catalog', async () => {
    await client
      .get('/automation/catalog')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  // const testBomId= '6036548e0dab8ec87e6acc38';
  // it('GET the terraform for a specific bom', async () => {
  //   await client
  //     .get(`/automation/${testBomId}`)
  //     .expect(200)
  //     .expect('Content-Type', /application\/json/);
  // });

});
