import {Inject} from 'typescript-ioc';
import {
  Count,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {inject} from "@loopback/core";
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
import _ from 'lodash';
import { ServicesController, AutomationCatalogController } from '.';
import { Bom, Services } from '../models';
import { ArchitecturesRepository, BomRepository, ServicesRepository, ControlMappingRepository, UserRepository } from '../repositories';

import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler} from '../types';

import { ServicesHelper } from '../helpers/services.helper';

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BomComposite {
  _id?: string,
  arch_id?: string,
  service_id: string,
  desc: string,
  yaml: string,
  service: Services,
  automation: object | undefined,
  catalog: {
    overview_ui: {
      en: {
        display_name: string,
        long_description: string,
        description: string,
      }
    },
    tags: string[],
    provider: {
      name: string
    },
    geo_tags: string[],
    metadata: {
      ui: {
        urls: {
          catalog_details_url: string,
          apidocs_url: string,
          doc_url: string,
          instructions_url: string,
          terms_url: string
        }
      }
    }
  }
}

export class BomController {
  @Inject serviceHelper!: ServicesHelper;
  automationCatalogController: AutomationCatalogController;
  servicesController: ServicesController;

  constructor(
    @repository(BomRepository)
    public bomRepository : BomRepository,
    @repository(ServicesRepository)
    public servicesRepository : ServicesRepository,
    @repository(ArchitecturesRepository) 
    protected architecturesRepository: ArchitecturesRepository,
    @repository(ControlMappingRepository) 
    protected controlMappingRepository: ControlMappingRepository,
    @repository(UserRepository) protected userRepository: UserRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler
  ) { 
    if (!this.automationCatalogController) this.automationCatalogController = new AutomationCatalogController(this.architecturesRepository,this.servicesRepository,this.userRepository,fileHandler);
    if (!this.servicesController) this.servicesController = new ServicesController(this.servicesRepository,this.bomRepository,this.architecturesRepository, this.controlMappingRepository,this.userRepository,fileHandler);
  }

  @post('/boms')
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Bom, {
            title: 'NewBom',
            exclude: ['_id'],
          }),
        },
      },
    })
    bom: Omit<Bom, '_id'>,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Bom|Response> {
    if (bom.yaml) {
      await this.serviceHelper.validateBomModuleYaml(bom.yaml, bom.service_id);
    } else {
      bom.yaml = `name: ${bom.service_id}\n`
    }
    await this.servicesController.findById(bom['service_id']);
    return this.bomRepository.create(bom);
  }

  @get('/boms/count')
  async count(
    @param.where(Bom) where?: Where<Bom>,
  ): Promise<Count> {
    return this.bomRepository.count(where);
  }

  @get('/boms')
  async find(
    @param.filter(Bom) filter?: Filter<Bom>,
  ): Promise<Bom[]> {
    return this.bomRepository.find(filter);
  }

  @patch('/boms')
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Bom, {partial: true}),
        },
      },
    })
    bom: Bom,
    @inject(RestBindings.Http.RESPONSE) res: Response,
    @param.where(Bom) where?: Where<Bom>,
  ): Promise<Count|Response> {
    if (bom.yaml) {
      return res.status(400).send({error: {
        message: `You cannot update all yaml configs.`
      }});
    }
    return this.bomRepository.updateAll(bom, where);
  }

  @get('/boms/{id}')
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Bom, {exclude: 'where'}) filter?: FilterExcludingWhere<Bom>
  ): Promise<Bom> {
    return this.bomRepository.findById(id, filter);
  }

  @get('/boms/{id}/composite')
  async findCompositeById(
    @param.path.string('id') id: string,
    @param.filter(Bom, {exclude: 'where'}) filter?: FilterExcludingWhere<Bom>
  ): Promise<any> {
    // eslint-disable-next-line prefer-const
    let bom =  await this.bomRepository.findById(id, filter);
    // eslint-disable-next-line prefer-const
    let jsonObj:any = JSON.parse(JSON.stringify(bom));
    // Get service data
    try {
      jsonObj.service = await this.servicesController.findById(bom.service_id, {"include":["controls"]});
      jsonObj.automation = await this.automationCatalogController.automationById(bom.service_id);
    }
    catch(e) {
      console.error(e);
    }
    // Get catalog data
    try {
      jsonObj.catalog = await this.servicesController.catalogByServiceId(bom.service_id);
    }
    catch(e) {
      console.error(e);
    }
    return jsonObj;
  }

  @patch('/boms/{id}')
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Bom, {partial: true}),
        },
      },
    })
    bom: Bom,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Bom|Response> {
    if (bom.yaml) {
      const fullBom = await this.bomRepository.findById(id);
      await this.serviceHelper.validateBomModuleYaml(bom.yaml, fullBom.service_id);
    }
    await this.bomRepository.updateById(id, bom);
    return this.bomRepository.findById(id);
  }

  @del('/boms/{id}')
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    await this.bomRepository.deleteById(id);
  }

  @get('/boms/catalog/{bomId}')
  async compositeCatalogById(
    @param.path.string('bomId') bomId: string,
    @param.filter(Bom, {exclude: 'where'}) filter?: FilterExcludingWhere<Bom>
  ): Promise<any> {
    const bom_res = await this.bomRepository.findById(bomId, filter);
    const bom_serv_id = bom_res.service_id;        
    const bom_data = JSON.parse(JSON.stringify(bom_res));    
    console.log("*******bom_serv_id*********"+bom_serv_id);
    const serv_res = await this.servicesController.catalogByServiceId(bom_serv_id);    
    const srvc_data = JSON.parse(JSON.stringify(serv_res));    
  
    const result = _.merge(bom_data, srvc_data[0]);
    return result;
  }

  @get('/boms/services/{archid}')
  async compositeCatalogByArchId(
    @param.path.string('archid') archid: string,    
  ): Promise<BomComposite[]> {    
    const arch_bom_res = await this.architecturesRepository.boms(archid).find({ include: ['service'] });
    const arch_bom_data = JSON.parse(JSON.stringify(arch_bom_res));
    const jsonObj = [];
    for await (const p of arch_bom_data) {
      console.log("*******p.service_id*********"+p.service_id);
      // Get service data
      try {
        p.automation = await this.automationCatalogController.automationById(p.service_id);
      }
      catch(e) {
        console.error(e);
      }
      // Get catalog data
      try {
        p.catalog = await this.servicesController.catalogByServiceId(p.service_id);
        jsonObj.push(p);
      }
      catch(e) {
        console.error(e);
        jsonObj.push(p);
      }
    }
    return jsonObj;
  }  
}
