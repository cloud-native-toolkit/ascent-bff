// Uncomment these imports to begin using these cool features!

// import {inject} from '@loopback/core';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Inject } from 'typescript-ioc';

import { get, oas, param, Response, RestBindings } from '@loopback/rest';

import * as _ from "lodash"

// FS Architectures Data Models
import {
  ArchitecturesRepository,
  ServicesRepository,
  UserRepository
} from "../repositories";
import { Architectures, Bom } from "../models";

import { inject } from "@loopback/core";
import { repository } from "@loopback/repository";

import { FILE_UPLOAD_SERVICE } from '../keys';
import { FileUploadHandler } from '../types';
import { ArchitecturesController, DiagramType } from './architectures.controller'

import { IascableService, Service } from '../services/iascable.service';
import { S3 } from 'ibm-cos-sdk';


export class AutomationCatalogController {

  @Inject iascableService!: IascableService;
  archController: ArchitecturesController;

  constructor(
    @repository(ArchitecturesRepository)
    public architecturesRepository: ArchitecturesRepository,
    @repository(ServicesRepository)
    public serviceRepository: ServicesRepository,
    @repository(UserRepository)
    public userRepository: UserRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler
  ) {

    // console.log("Constructor for Automation Catalog")
    if (!this.archController) this.archController = new ArchitecturesController(this.architecturesRepository, this.userRepository, fileHandler);

  }

  //  @Inject
  //  tileBuilder!: TileBuilder;

  @get('/automation/catalog')
  async catalogLoader(): Promise<object> {
    return this.iascableService.getCatalog();
  }

  @get('/automation/catalog/boms')
  async getBomsCatalog(): Promise<object> {
    const catalog = JSON.parse(JSON.stringify(await this.iascableService.getCatalog()));
    delete catalog.modules;
    delete catalog.moduleIdAliases;
    delete catalog.flattenedAliases;
    return catalog;
  }

  @get('/automation/ids')
  async getCatalogIDs(): Promise<object> {
    const data: Object[] = [];
    const catalog = await this.iascableService.getCatalog();
    catalog.modules.forEach(module => {
      data.push({ name: module.name, id: module.id });
    });
    return { data };
  }

  @get('/automation/{id}/details')
  async automationById(
    @param.path.string('id') id: string,
  ): Promise<Service> {
    return this.iascableService.getService(id);
  }

  @get('/automation/{bomid}')
  @oas.response.file()
  async downloadAutomationZip(
    @param.path.string('bomid') bomid: string,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ) {

    // Check if we have a bom ID
    if (_.isUndefined(bomid)) {
      return res.sendStatus(404);
    }

    // Read the Architecture Data
    const architecture: Architectures = await this.architecturesRepository.findById(bomid);

    if (_.isEmpty(architecture)) {
      return res.sendStatus(404);
    }

    // Read Architecture Bill of Materials
    const automationBom: Bom[] = await this.architecturesRepository.boms(bomid).find();

    if (_.isEmpty(automationBom)) {
      return res.sendStatus(404);
    }

    let drawio:S3.Body = '', png:S3.Body = '';
    try {
      drawio = await this.archController.getDiagram(architecture.arch_id, DiagramType.DRAWIO);
      png = await this.archController.getDiagram(architecture.arch_id, DiagramType.PNG);
    } catch (error:any) {
      console.log(error);
    }

    return this.iascableService.buildTerraform(architecture, automationBom, drawio, png);
  }

  @get('/catalog/{id}')
  catalogId(): object {
    // Retrieve the Catalog and convert it to JSON
    // https://raw.githubusercontent.com/ibm-garage-cloud/garage-terraform-modules/gh-pages/index.yaml
    return { 'status': 'UP' };
  }

}
