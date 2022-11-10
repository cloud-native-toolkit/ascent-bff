import { Client, expect } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

/* eslint-disable @typescript-eslint/naming-convention */

describe('OnBoardingStage', () => {
    let app: AscentBffApplication;
    let client: Client;
    let stageId = '000'

    before('setupApplication', async () => {
        ({ app, client } = await setupApplication());
    });

    after(async () => {
        await app.stop();
    });

    it('GET on-boarding-stages count', async () => {
        await client
            .get('/on-boarding-stages/count')
            .expect(200)
            .expect('Content-Type', /application\/json/)
            .expect(/{"count":\d+}/);
    });

    it('GET all on-boarding-stages', async () => {
        await client
            .get('/on-boarding-stages')
            .expect(200)
            .expect('Content-Type', /application\/json/);
    });

    it('POST, GET, PATCH, then DELETE a stage', async () => {
        await client
          .post('/on-boarding-stages').send({
            'label': 'test stage',
            'secondary_label': 'Test controls',
            'position': 0,
            'content': '{"id":"AC-14","children":[{"id":"AC-17 (9)","children":[{"id":"AC-19 (5)","children":[{"id":"AC-20"},{"id":"SC-12"}]},{"id":"AC-21","children":[{"id":"AC-5"}]}]}]}'
          })
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .then((res) => {
            stageId = res.body.id;
          });
        await client
          .get(`/on-boarding-stages/${stageId}`)
          .expect(200)
          .expect('Content-Type', /application\/json/);
        await client
          .patch(`/on-boarding-stages/${stageId}`).send({
            'secondary_label': 'Test controls updated'
          })
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .then((res) => {
            expect(res.body).to.containEql({'secondary_label': 'Test controls updated'});
          });
        await client
          .delete(`/on-boarding-stages/${stageId}`)
          .expect(204);
      });
    
      it('PATCH all on-boarding-stages', async () => {
        await client
          .patch(`/on-boarding-stages`).send({
            'secondary_label': 'Test controls updated'
          })
          .expect(200)
          .expect('Content-Type', /application\/json/)
          .expect(/{"count":\d+}/);
      });

});
