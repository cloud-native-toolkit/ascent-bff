import {Inject} from 'typescript-ioc';
import {
  Count,
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
  Response,
  RestBindings
} from '@loopback/rest';
import {inject} from "@loopback/core";


import { Services } from '../models';
import { ArchitecturesRepository, BomRepository, ServicesRepository, ControlMappingRepository, UserRepository } from '../repositories';
import { CatalogController } from './catalog.controller';
import { AutomationCatalogController } from '.';

import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler} from '../types';
import { IascableService, Service } from '../services/iascable.service';

import { serviceMapping } from '../service-mapping';

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class ServicesController {

  @Inject iascableService!: IascableService;
  automationCatalogController: AutomationCatalogController;
  catalogController: CatalogController;

  constructor(
    @repository(ServicesRepository)
    public servicesRepository: ServicesRepository,
    @repository(BomRepository)
    public bomRepository: BomRepository,
    @repository(ArchitecturesRepository)
    protected architecturesRepository: ArchitecturesRepository,
    @repository(ControlMappingRepository)
    protected controlMappingRepository: ControlMappingRepository,
    @repository(UserRepository) protected userRepository: UserRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler
  ) {
    if (!this.automationCatalogController) this.automationCatalogController = new AutomationCatalogController(this.architecturesRepository,this.servicesRepository,this.userRepository,fileHandler);
    if (!this.catalogController) this.catalogController = new CatalogController;
  }

  @post('/services')
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
    service: Services,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Services|object> {
    service.ibm_catalog_id = serviceMapping.find(m => m.name === service.service_id)?.ibm_catalog_id;
    return this.servicesRepository.create(service);
  }

  @get('/services/count')
  async count(): Promise<Count> {
    const services = await this.iascableService.getServices();
    return {
      count: services.length
    }
  }

  @get('/services')
  async find(
    @param.filter(Services) filter?: Filter<Services>,
  ): Promise<Service[]> {
    const records = await this.servicesRepository.find(filter);
    let services:Service[] = await this.iascableService.getServices();
    if (filter) services = services.filter(service => records.findIndex(record => record.service_id === service.name) >= 0);
    for (let index = 0; index < services.length; index++) {
      let service = records.find(r => r.service_id === services[index].name);
      if (!service) {
        service = await this.servicesRepository.create({
          service_id: services[index].name,
          fullname: services[index].displayName,
          ibm_catalog_id: serviceMapping.find(m => m.name === services[index].name)?.ibm_catalog_id,
          fs_validated: false
        })
      }
      services[index] = {...services[index], ...service};
    }
    return services;
  }

  @get('/services/composite')
  async findComposite(
    @param.filter(Services) filter?: Filter<Services>,
  ): Promise<any> {
    let services = await this.servicesRepository.find(filter);
    services = JSON.parse(JSON.stringify(services));
    const jsonObj = [];
    for await (const p of services) {
      // Get automation data
      try {
        p.automation = await this.automationCatalogController.automationById(p.service_id);
      }
      catch(e) {
        console.error(e);
      }
      // Get catalog data
      try {
        p.catalog = await this.catalogByServiceId(p.service_id);
        jsonObj.push(p);
      }
      catch(e) {
        console.error(e);
        jsonObj.push(p);
      }
    }
    return jsonObj;
  }

  @patch('/services')
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Services, { partial: true }),
        },
      },
    })
    services: Services,
    @inject(RestBindings.Http.RESPONSE) res: Response,
    @param.where(Services) where?: Where<Services>,
  ): Promise<Count|object> {
    return this.servicesRepository.updateAll(services, where);
  }

  @get('/services/{id}')
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Services, { exclude: 'where' }) filter?: FilterExcludingWhere<Services>
  ): Promise<Service> {
    let service = await this.iascableService.getService(id);
    try {
      const serviceDetails = await this.servicesRepository.findById(id, filter);
      service = {...service, ...serviceDetails};
    } catch (error) {
      console.log(error);
    }
    return service;
  }

  @patch('/services/{id}')
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Services, { partial: true }),
        },
      },
    })
    service: Services,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Services|object> {
    await this.servicesRepository.updateById(id, service);
    return this.servicesRepository.findById(id);
  }

  @del('/services/{id}')
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    await this.bomRepository.deleteAll({'service_id': id});
    await this.controlMappingRepository.deleteAll({'service_id': id});
    await this.servicesRepository.deleteById(id);
  }

  @get('services/catalog/{serviceId}')
  async catalogByServiceId(
    @param.path.string('serviceId') serviceId: string
  ): Promise<any> {

    let jsonObj = {};
    try {

      const service = await this.findById(serviceId);

      if (!service?.ibm_catalog_id) {
        throw new Error(`Service ${serviceId} does not have a catalog id`);
      }

      const automation_res = await this.catalogController.catalogById(service.ibm_catalog_id);

      const data = JSON.parse(automation_res);
      let found = false;
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let index = 0; index < data.resources.length; index++) {
        const element = data.resources[index];
        if (element.id === service.ibm_catalog_id) {
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


  @get('bom/services/catalog/{bomId}')
  async catalogByBomId(
    @param.path.string('bomId') bomId: string
  ): Promise<any[]> {

    const bom_res = this.bomRepository.findById(bomId);
    const bomServiceid = (await bom_res).service_id;


    const service = await this.findById(bomServiceid);

      if (!service?.ibm_catalog_id) {
      throw new Error(`BOM ${bomId} does not have a catalog id`);
    }

    const automation_res = await this.catalogController.catalogById(bomServiceid);
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
