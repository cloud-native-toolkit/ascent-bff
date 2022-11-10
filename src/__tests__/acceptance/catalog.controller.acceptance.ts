/*import { Client } from '@loopback/testlab';
import { AscentBffApplication } from '../..';
import { setupApplication } from './test-helper';

describe('Catalog', () => {
  let app: AscentBffApplication;
  //let client: Client;

  before('setupApplication', async () => {
    ({ app, client } = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  /*it('GET the catalog', async () => {
    await client
      .get('/catalog')
      //.expect(200)
      //.expect('Content-Type', /application\/json/);
  });

  it('GET an element of the catalog by id', async () => {
    await client
      .get('/catalog/is.vpc')
      //.expect(200)
      //.expect('Content-Type', /application\/json/);
  });

});*/
