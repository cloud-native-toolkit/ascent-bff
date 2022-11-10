import { Client, expect } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

/* eslint-disable @typescript-eslint/naming-convention */

describe('Architecture Bom', () => {
  let app: AscentBffApplication;
  let client: Client;
  const testArchId= 'arch01';
  const testBomId= 'test_service';

  before('setupApplication', async function(this, done) {
    this.timeout(5000);
    ({ app, client } = await setupApplication());
    done();
  });

  after(async () => {
    await app.stop();
  });

  it('POST a architecture bom', async () => {
    await client
      .post(`/architectures/${testArchId}/boms`).send({
        "desc": "string",
        'service_id': testBomId
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .then((res) => {
        expect(res.body).to.containEql({'service_id': testBomId});
      });
  });

  it('GET a bom from reference architecture id', async () => {
    await client
      .get(`/architectures/${testArchId}/boms`)
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('PATCH a architecture', async () => {
    await client
      .patch(`/architectures/${testArchId}/boms`).send({
        "desc": "test desc updated"
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

  it('DELETE a architecture', async () => {
    await client
      .delete(`/architectures/${testArchId}/boms`)
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

});
