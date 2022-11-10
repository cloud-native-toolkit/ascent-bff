import { Client, expect } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

/* eslint-disable @typescript-eslint/naming-convention */

describe('Bom', () => {
  let app: AscentBffApplication;
  let client: Client;
  const testBom = 'argocd'
  let testBomId = '000'

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET boms count', async () => {
    await client
      .get('/boms/count')
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

  it('GET all boms', async () => {
    await client
      .get('/boms')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  it('POST, GET, PATCH, then DELETE a bom', async () => {
    await client
      .post('/boms').send({
        'arch_id': 'reference',
        'service_id': testBom
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .then((res) => {
        testBomId = res.body._id;
      });
    await client
      .get(`/boms/${testBomId}`)
      .expect(200)
      .expect('Content-Type', /application\/json/);
    await client
      .patch(`/boms/${testBomId}`).send({
        'desc': 'test desc updated'
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .then((res) => {
        expect(res.body).to.containEql({'desc': 'test desc updated'});
      });
    await client
      .delete(`/boms/${testBomId}`)
      .expect(204);
  });

  it('PATCH all boms', async () => {
    await client
      .patch(`/boms`).send({
        'desc': 'test desc updated'
      })
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .expect(/{"count":\d+}/);
  });

});
