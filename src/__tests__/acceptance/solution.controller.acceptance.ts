import { Client, expect } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

describe('Solution', () => {
    let app: AscentBffApplication;
    let client: Client;
    const testSolutionId = "test-solution"

    before('setupApplication', async () => {
        ({ app, client } = await setupApplication());
    });

    after(async () => {
        await app.stop();
    });

    it('GET all solution', async () => {
        await client
            .get('/solutions')
            .expect(200)
            .expect('Content-Type', /application\/json/);
    });

    it('POST a solution', async () => {
        await client
            .post('/solutions').send({
                solution: {"id": testSolutionId,
                "name": "Test Solution"},
                architectures: []
            })
            .expect(200)
            .expect('Content-Type', /application\/json/);
    });

    it('GET solution by id', async () => {
        await client
            .get(`/solutions/${testSolutionId}`)
            .expect(200)
            .expect('Content-Type', /application\/json/);
    });

    it('PATCH a solution', async () => {
        await client
            .patch(`/solutions/${testSolutionId}`).send({
                solution: {"name": "Test name updated"},
                architectures: []
            })
            .expect(200)
            .expect('Content-Type', /application\/json/)
            .then((res) => {
              expect(res.body).to.containEql({'name': 'Test name updated'});
            });
    });

    it('DELETE a solution', async () => {
        await client
            .delete(`/solutions/${testSolutionId}`)
            .expect(204);
    });

});
