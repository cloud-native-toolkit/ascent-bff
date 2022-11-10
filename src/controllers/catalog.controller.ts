import { get, param, response } from "@loopback/rest";
import { createNodeRedisClient } from 'handy-redis';
import { URL } from 'url';
import axios from 'axios';

export class CatalogController {
  constructor() {}

  @get('/catalog/{offset}/{limit}')
  async catalog(
    @param.path.string('offset') offset: string,
    @param.path.string('limit') limit: string,
  ): Promise<JSON> {

    const url = new URL("https://globalcatalog.cloud.ibm.com/api/v1?_offset=" + offset + "&_limit=" + limit + "&complete=false");
    const res = await axios(url.toString());

    if (res.status >= 400) {
      throw new Error("Bad response from server");
    }
    const data = await res.data;
    return data;
  }

  @get('/catalog/{id}')
  @response(200)
  async catalogById(
    @param.path.string('id') id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {

    const client = createNodeRedisClient(6379, "localhost");
    const jsonobj = [];
    try {
      const key = id.toString().trim();

      if (await client.exists(id) !== 0) {
        
      const result = await client.get(key);
      jsonobj.push(result);
      console.log(`IBM Catalog data retrieved from the cache -> ${key}`);
      } else {
        const url = new URL('https://globalcatalog.cloud.ibm.com/api/v1?_limit=100&complete=false&q=' + key);        
        const res = await axios(url.toString());
        const data = await res.data;
        if (data.resource_count !== 0) {
          await client.set(key, JSON.stringify(data));
          jsonobj.push(JSON.stringify(data));
          console.log("cache miss-->"+key);
        } else {
          console.log("There is no catalog service with this id " + key);
          jsonobj.push(JSON.stringify(data));
        }
       }
    } catch (error) {
      return jsonobj;
    }
    return jsonobj;
  }
}
