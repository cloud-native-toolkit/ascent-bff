/* eslint-disable @typescript-eslint/naming-convention */
import { Client, expect } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

describe('Control Nist', () => {
  let app: AscentBffApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('GET a control nist by control id', async () => {
    const controlId = 'AC-3';
    await client
      .post('/controls').send({
        "id": controlId,
        "name": "test name",
      })
      .expect(200)
      .expect('Content-Type', /application\/json/);
    await client
      .post('/nist').send({
        "number": controlId,
        "family": "ACCESS CONTROL",
        "title": "ACCESS ENFORCEMENT",
        "priority": "P1",
        "statement": { "description": "The information system..."},
        "base_control": "true"
      })
      .expect(200)
      .expect('Content-Type', /application\/json/);
    await client
      .get(`/controls/${controlId}/nist`)
      .expect(200)
      .expect('Content-Type', /application\/json/)
      .then((res) => {
        expect(res.body).to.have.property('number');
      });
  });

});
