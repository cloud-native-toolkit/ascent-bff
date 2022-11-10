import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

/* eslint-disable @typescript-eslint/naming-convention */

describe('Control Mapping', () => {
  let app: AscentBffApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET all control mappings', async () => {
    await client
      .get('/control-mapping')
      .query({filter: {
        limit:50
      }})
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('GET controls impacting a service', async () => {
    await client
      .get('/services/cloud-object-storage/controls')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('GET services impacted by a control', async () => {
    await client
      .get('/controls/AC-3 (2)/services')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('DELETE a control mapping', async () => {
    await client
      .delete('/control-mapping').send({
        "control_id": "SI-11",
        "arch_id": "simple"
      })
      .expect(200)
      .expect(/{"count":\d+}/);
  });

});
