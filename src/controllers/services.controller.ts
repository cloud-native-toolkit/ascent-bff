import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  del,
  requestBody,
  response,
} from '@loopback/rest';
import { Services } from '../models';
import { ArchitecturesRepository, BomRepository, ServicesRepository } from '../repositories';
import { BomController } from './bom.controller';
import { CatalogController } from './catalog.controller';

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class ServicesController {
  constructor(
    @repository(ServicesRepository)
    public servicesRepository: ServicesRepository,
    @repository(BomRepository)
    public bomRepository: BomRepository,
    @repository(ArchitecturesRepository)
    protected architecturesRepository: ArchitecturesRepository,
  ) { }

  @post('/services')
  @response(200, {
    description: 'Services model instance',
    content: { 'application/json': { schema: getModelSchemaRef(Services) } },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Services, {
            title: 'NewServices'
          }),
        },
      },
    })
    services: Services,
  ): Promise<Services> {
    return this.servicesRepository.create(services);
  }

  @get('/services/count')
  @response(200, {
    description: 'Services model count',
    content: { 'application/json': { schema: CountSchema } },
  })
  async count(
    @param.where(Services) where?: Where<Services>,
  ): Promise<Count> {
    return this.servicesRepository.count(where);
  }

  @get('/services')
  @response(200, {
    description: 'Array of Services model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Services, { includeRelations: true }),
        },
      },
    },
  })
  async find(
    @param.filter(Services) filter?: Filter<Services>,
  ): Promise<Services[]> {
    return this.servicesRepository.find(filter);
  }

  @patch('/services')
  @response(200, {
    description: 'Services PATCH success count',
    content: { 'application/json': { schema: CountSchema } },
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Services, { partial: true }),
        },
      },
    })
    services: Services,
    @param.where(Services) where?: Where<Services>,
  ): Promise<Count> {
    return this.servicesRepository.updateAll(services, where);
  }

  @get('/services/{id}')
  @response(200, {
    description: 'Services model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Services, { includeRelations: true }),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Services, { exclude: 'where' }) filter?: FilterExcludingWhere<Services>
  ): Promise<Services> {
    return this.servicesRepository.findById(id, filter);
  }

  @patch('/services/{id}')
  @response(200, {
    description: 'Controls model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Services),
      },
    },
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Services, { partial: true }),
        },
      },
    })
    services: Services,
  ): Promise<Services> {
    await this.servicesRepository.updateById(id, services);
    return this.servicesRepository.findById(id);
  }

  @del('/services/{id}')
  @response(204, {
    description: 'Services DELETE success',
  })
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    await this.servicesRepository.deleteById(id);
  }

  @get('services/catelog/{serviceId}')
  @response(200, {
    description: 'catalog by serviceId',
    content: 'application/json'
  })
  async catalogByServiceId(
    @param.path.string('serviceId') serviceId: string
  ): Promise<any> {

    let jsonObj = {};
    try {

      const serv_res = new ServicesController(this.servicesRepository, this.bomRepository, this.architecturesRepository).findById(serviceId);
      const service_id = (await serv_res).service_id;

      if (service_id !== serviceId) {
        throw new Error("There is no services id corresponding to this bom id" + serviceId);
      }

      const automation_res = await (new CatalogController).catalogById(serviceId);

      const data = JSON.parse(automation_res);
      let found = false;
      for (let index = 0; index < data.resources.length; index++) {
        const element = data.resources[index];
        if (element.name === serviceId || element.id === serviceId) {
          jsonObj = element;
          found = true;
        }
      }
      if (!found) {
        jsonObj = data.resources[0];
      }
    } catch (error) {
      return jsonObj;
    }
    return jsonObj;
  }


  @get('bom/services/catelog/{bomId}')
  @response(200, {
    description: 'catalog by bomId',
    content: 'application/json'
  })
  async catalogByBomId(
    @param.path.string('bomId') bomId: string
  ): Promise<any[]> {

    const bom_res = new BomController(this.bomRepository, this.servicesRepository, this.architecturesRepository).findById(bomId);
    const bomServiceid = (await bom_res).service_id;


    const serv_res = new ServicesController(this.servicesRepository, this.bomRepository, this.architecturesRepository).findById(bomServiceid);
    const serviceid = (await serv_res).service_id;

    if (serviceid !== bomServiceid) {
      throw new Error("There is no services id corresponding to this bom id" + bomId);
    }

    const automation_res = await (new CatalogController).catalogById(bomServiceid);
    //const data = JSON.parse(JSON.stringify(automation_res));
    const data = JSON.parse(automation_res);
    const jsonObj = [];
    const item = {
      "id": data.resources[0].id,
      "name": data.resources[0].name,
      "description": data.resources[0].overview_ui.en.description,
      "geo": data.resources[0].geo_tags
    }

    jsonObj.push(item);
    return jsonObj;

  }

}
