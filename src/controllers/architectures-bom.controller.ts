import {Inject} from 'typescript-ioc';
import {
  Count,
  CountSchema,
  Filter,
  repository,
  Where,
} from '@loopback/repository';
import {inject} from "@loopback/core";
import {
  del,
  get,
  getModelSchemaRef,
  getWhereSchemaFor,
  param,
  patch,
  post,
  requestBody,
  Request,
  response,
  Response,
  oas,
  RestBindings
} from '@loopback/rest';
import {
  Architectures,
  AutomationRelease,
  Bom
} from '../models';
import {
  ArchitecturesRepository,
  BomRepository,
  ControlDetailsRepository,
  ControlMappingRepository,
  ServicesRepository,
  UserRepository,
  AutomationReleaseRepository
} from '../repositories';
import { BomController } from '.';

import catalogConfig from '../config/automation-catalog.config';

import fetch from 'node-fetch';
import AdmZip = require("adm-zip");

import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler, File} from '../types';

import { ServicesHelper } from '../helpers/services.helper';

import { Document as PDFDocument, Image, cm, Font } from "pdfjs";
import Jimp from "jimp";
import fs from "fs";

import { ArchitecturesController, DiagramType } from './architectures.controller'

const latestReleaseUrl = catalogConfig.latestReleaseUrl;

/* eslint-disable no-throw-literal */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

export class ArchitecturesBomController {
  @Inject serviceHelper!: ServicesHelper;
  bomController: BomController;
  archController: ArchitecturesController;

  fonts: {
    plex: Font,
    plexBold: Font
  };

  constructor(
    @repository(ArchitecturesRepository) protected architecturesRepository: ArchitecturesRepository,
    @repository(BomRepository) protected bomRepository: BomRepository,
    @repository(ControlMappingRepository) protected cmRepository: ControlMappingRepository,
    @repository(ServicesRepository) protected servicesRepository: ServicesRepository,
    @repository(UserRepository) protected userRepository: UserRepository,
    @repository(AutomationReleaseRepository) protected automationReleaseRepository: AutomationReleaseRepository,
    @repository(ControlDetailsRepository) protected controlDetailsRepository: ControlDetailsRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler
  ) {
    if (!this.bomController) this.bomController = new BomController(this.bomRepository, this.servicesRepository, this.architecturesRepository, this.cmRepository, this.userRepository, fileHandler);
    if (!this.archController) this.archController = new ArchitecturesController(this.architecturesRepository, this.userRepository, fileHandler);
    if (!this.fonts) this.fonts = {
      plex: new Font(fs.readFileSync('./fonts/IBMPlexSans-Regular.ttf')),
      plexBold: new Font(fs.readFileSync('./fonts/IBMPlexSans-Bold.ttf'))
    };
  }

  importYaml = async (
    yamlString:string,
    overwrite: string,
    publicArch: boolean,
    email?: string,
  ) => {
    const { arch, boms } = await this.serviceHelper.parseBomYaml(yamlString, publicArch);
    // Try to get corresponding architecture
    let curArch:Architectures;
    let archExists = false;
    try {
      curArch = await this.architecturesRepository.findById(arch.arch_id);
      if (!curArch) throw new Error();
      archExists = true;
    } catch (getArchError) {
      console.log(`Architecture ${arch.arch_id} does not exist, creating it...`);
    }
    // Do not delete the architecture document accept it and love it and just update the variable
    if (archExists && !overwrite) throw { message: `Architecture ${arch.arch_id} already exists. Set 'overwrite' parameter to overwrite.` };
    // Delete Existing Arch & BOMs
    await this.architecturesRepository.boms(arch.arch_id).delete();
    if (archExists) await this.architecturesRepository.deleteById(arch.arch_id);
    // Create Arch
    if (email) await this.userRepository.architectures(email).create(arch);
    else await this.architecturesRepository.create(arch);
    // Import automation modules
    for (const newBom of boms) {
      await this.architecturesRepository.boms(arch.arch_id).create(newBom);
    }
    return arch;
  }

  @get('/architectures/{id}/boms', {
    responses: {
      '200': {
        description: 'Array of Architectures has many Bom',
        content: {
          'application/json': {
            schema: {type: 'array', items: getModelSchemaRef(Bom)},
          },
        },
      },
    },
  })
  async find(
    @param.path.string('id') id: string,
    @param.query.object('filter') filter?: Filter<Bom>,
  ): Promise<Bom[]> {
    return this.architecturesRepository.boms(id).find(filter);
  }

  @get('/architectures/{archid}/compliance-report')
  @response(200, {
    description: 'Download PDF compliance report based on the reference architecture BOM',
  })
  @oas.response.file()
  async downloadComplianceReport(
    @param.path.string('archid') archId: string,
    @param.query.string('profile') profileId: string,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ) {
    // Get data
    const arch = await this.architecturesRepository.findById(archId);
    const archBom = await this.bomController.compositeCatalogByArchId(archId);
    const services = [...new Set(archBom.map(bom => bom.service))];
    const serviceIds = [...new Set(archBom.map(bom => bom.service_id))];
    const mappings = await this.cmRepository.find({
      "where": {
        "service_id": {
          "inq": serviceIds
        },
        "scc_profile": profileId
      },
      "include": [
        "profile",
        "goals",
        "control"
      ]
    });
    const controls = [...new Set(mappings.map(mapping => mapping.control))];

    // Build PDF Document
    const doc = new PDFDocument({
      font: this.fonts.plex,
      padding: 50,
      fontSize: 11
    });
    
    doc.footer().pageNumber(function(curr, total) { return curr + ' / ' + total }, { textAlign: 'center' })
    doc.text(`${arch.name}\n\n`, { textAlign: 'center', fontSize: 32 });
    // Fetch diagram PNG from COS
    if (arch.arch_id) {
      try {
        const diagram = await this.archController.getDiagram(arch.arch_id, DiagramType.PNG);
        fs.writeFileSync('/tmp/arch.png', diagram);
        const image = await Jimp.read('/tmp/arch.png');
        doc.image(new Image(await image.getBufferAsync(Jimp.MIME_JPEG)), { width: 750, align: 'center' });
      } catch (error) {
        console.log(error);
      }
    }
    doc.pageBreak();
    // Table of contents
    let tocIx = 0;
    doc.text(`Table of contents`, { fontSize: 24 });
    doc.text(`${++tocIx}.  Bill of Materials`, {
      goTo: 'bom'
    });
    doc.text(`${++tocIx}.  Services`, {
      goTo: 'services'
    });
    let serviceIx = 0;
    for await (const service of services) {
      if (service) doc.text(`    ${tocIx}.${++serviceIx}.  ${service.name ?? service.service_id}`, {
        goTo: service.service_id
      });
    }
    doc.text(`${++tocIx}.  Controls`, {
      goTo: 'controls'
    });
    let controlIx = 0;
    for await (const control of controls) {
      if (control) doc.text(`    ${tocIx}.${++controlIx}.  ${(control.name && (control.id + " " + control.name)) || control.id}`, {
        goTo: control.id
      });
    }
    doc.pageBreak();
    // END: Table of contents
    const bomCell = doc.cell({ paddingBottom: 0.5*cm });
    bomCell.destination('bom');
    bomCell.text(`Bill of Materials`, { fontSize: 24 });
    for await (const p of archBom) {
      bomCell.text(`- ${p.desc}:`)
        .append(` ${p.service.name ?? p.service.service_id}`, {
          goTo: p.service.service_id,
          underline: true,
          color: 0x569cd6
        });
    }
    const servicesCell = doc.cell({ paddingBottom: 0.5*cm });
    servicesCell.destination('services');
    servicesCell.text(`Services`, { fontSize: 24 });
    for await (const service of services) {
      if (service) {
        const serviceCell = servicesCell.cell({ paddingBottom: 0.5*cm });
        const catalog = archBom.find(elt => elt.service.service_id === service.service_id)?.catalog;
        serviceCell.destination(service.service_id);
        serviceCell.text(`${service.name ?? service.service_id}`, { fontSize: 20 });
        serviceCell.text(`Description`, { fontSize: 16 });
        serviceCell.text(`${catalog?.overview_ui?.en?.long_description ?? catalog?.overview_ui?.en?.description ?? service.desc}`);
        if (catalog?.provider?.name) serviceCell.text(`- Provider: ${catalog?.provider?.name}`);
        if (service.grouping) serviceCell.text(`- Group: ${service.grouping}`);
        if (service.deployment_method) serviceCell.text(`- Deployment Method: ${service.deployment_method}`);
        if (service.provision) serviceCell.text(`- Provision: ${service.provision}`);
        const serviceMappings = mappings.filter(elt => elt.service_id === service.service_id);
        if (serviceMappings.length) {
          serviceCell.text(`Impacting controls`, { fontSize: 16 });
          const table = serviceCell.table({
            padding: 2,
            widths: [2.5*cm, 2.5*cm, '*'],
            borderHorizontalWidths: function(i) { return i < 2 ? 1 : 0.1 },
            // borderVerticalWidths: [0.1,0.1,0.1,0.1,0.1,0.1],
            fontSize: 9
          });
          const header = table.header({
            font: this.fonts.plexBold,
            fontSize: 11
          });
          header.cell('Control ID');
          header.cell('SCC Goal');
          header.cell('Goal Description');
          for (const mp of serviceMappings) {
            for (const goal of mp?.goals) {
              const row = table.row();
              if (mp.control_id && mp?.control?.id) row.cell(mp?.control?.id, {
                goTo: mp.control_id,
                underline: true,
                color: 0x569cd6
              });
              else row.cell(mp.control_id);
              row.cell(goal.goal_id, {
                link: `https://cloud.ibm.com/security-compliance/goals/${goal.goal_id}`,
                underline: true,
                color: 0x569cd6
              });
              row.cell(goal.description);
            }
          }
        }
      }
    }
    const controlsCell = doc.cell({ paddingBottom: 0.5*cm });
    controlsCell.destination('controls');
    controlsCell.text(`Controls`, { fontSize: 24 });
    for await (const control of controls) {
      if (control) {
        const controlDetails = await this.controlDetailsRepository.findById(control.id);
        const controlCell = controlsCell.cell({ paddingBottom: 0.5*cm });
        controlCell.destination(control.id);
        controlCell.text(`${(control.name && (control.id + " " + control.name)) || control.id}`, { fontSize: 20 });
        controlCell.text(`Description`, { fontSize: 16 });
        controlCell.text(`${controlDetails.requirements.map(req => req.id + ':\n' + req.description + '\n\n')}`);
        // if (control.parent_control) controlCell.text(`- Parent control: ${control.parent_control}`);
        if (controlDetails.fs_guidance) {
          controlCell.text(`Additionnal FS Guidance`, { fontSize: 14 });
          controlCell.text(controlDetails.fs_guidance
            .replace(/\n\*\*([a-zA-Z1-9\(\)]+)\*\*/gi, '\n$1')
            .replace(/\n\n/gi, '\n').replace(/\n\n/gi, '\n')
            .replace(/\*\*Note\*\*/gi, 'Note')
            .replace(/\*\*Note:\*\*/gi, 'Note:'));
        }
        controlCell.text(`Parameters`, { fontSize: 16 });
        controlCell.text(`${controlDetails.fs_params?.replace(/\*/gi, '')}`);
        controlCell.text(`Solution and Implementation`, { fontSize: 16 });
        const implemParts = controlDetails.implementation
          ?.replace(/\n\n/gi, '\n').replace(/\n\n/gi, '\n').replace(/\n\n/gi, '\n')
          .replace(/\n#### Part ([a-z][1-9]?\))/gi, '\nPart $1')
          .split(/\n(Part [a-z][1-9]?\))/gi);
        if (implemParts) for (const part of implemParts) {
          if (part.startsWith('Part')) controlCell.text(part, { fontSize: 14 });
          else if (part) {
            const guidances = part.replace(/\n##### Provider ((?:Evidence|Implementation){1} Guidance)\s?\n?/gi, '\n$1').split(/\n((?:Evidence Guidance)|(?:Implementation Guidance))/gi);
            for (const guidance of guidances) {
              if (guidance.startsWith('Evidence') || guidance.startsWith('Implementation')) controlCell.text(`Provider ${guidance}`, {
                font: this.fonts.plexBold
              });
              else if (guidance) controlCell.text(guidance
                .replace(/\n\*\*([a-zA-Z1-9\(\)]+)\*\*/gi, '\n$1')
                .replace(/\*\*Note\*\*/gi, 'Note')
                .replace(/\*\*Note:\*\*/gi, 'Note:'));
            }
          }
        }
      }
    }
    // Send PDF Document
    return doc.asBuffer();
  }

  @post('/architectures/{id}/boms', {
    responses: {
      '200': {
        description: 'Architectures model instance',
        content: {'application/json': {schema: getModelSchemaRef(Bom)}},
      },
    },
  })
  async create(
    @param.path.string('id') id: typeof Architectures.prototype.arch_id,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Bom, {
            title: 'NewBomInArchitectures',
            exclude: ['_id'],
            optional: ['arch_id']
          }),
        },
      },
    }) bom: Omit<Bom, '_id'>,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Bom|Response> {
    if (bom.yaml) {
      await this.serviceHelper.validateBomModuleYaml(bom.yaml, bom.service_id);
    } else {
      bom.yaml = `name: ${bom.service_id}\n`
    }
    return this.architecturesRepository.boms(id).create(bom);
  }

  @post('/architectures/boms/import', {
    responses: {
      200: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
            },
          },
        },
        description: 'Information about the import status',
      },
    },
  })
  async uploadBomYaml(
    @requestBody.file()
    request: Request,
    @inject(RestBindings.Http.REQUEST) req: any,
    @inject(RestBindings.Http.RESPONSE) res: Response,
    @param.query.string('overwrite') overwrite: string,
    @param.query.boolean('public') publicArch: boolean
  ): Promise<object> {
    console.log(publicArch);
    const user:any = req?.user;
    const email:string = user?.email;
    return new Promise<object>((resolve, reject) => {
      this.fileHandler(request, res,(err: unknown) => {
        const success:Architectures[] = [];
        (async () => {
          if (err) {
            throw err;
          } else {

            const uploadedFiles = request.files;
            const mapper = (f: globalThis.Express.Multer.File) => ({
              mimetype: f.mimetype,
              buffer: f.buffer,
              size: f.size,
              fieldname: f.fieldname,
              name: f.originalname
            });
            let files: File[] = [];
            if (Array.isArray(uploadedFiles)) {
              files = uploadedFiles.map(mapper);
            } else {
              for (const filename in uploadedFiles) {
                files.push(...uploadedFiles[filename].map(mapper));
              }
            }
            // Check uploaded files
            for (const file of files) {
              if (file.mimetype !== "application/x-yaml" && file.mimetype !== "text/yaml" && !file.name.endsWith('.yaml')) throw {message: "You must only upload YAML files."};
              if (file.size > 102400) throw {message: "Files must me <= 100Ko."};
            }
            console.log(files);
            for (const file of files) {
              console.log(`Importing BOM ${file.name}`);
              const arch = await this.importYaml(file.buffer.toString(), overwrite, publicArch, email);
              success.push(arch);
            }
          }
        })()
        .then(() => resolve(res.status(200).send({ architectures: success })))
        .catch((error) => {
          reject(res.status(400).send({error: error}))
        });
      });
    });
  }

  @post('/architectures/public/sync')
  async syncRefArchs(
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<object|void> {
    // Get latest iascable release 
    const release = await (await fetch(latestReleaseUrl)).json();
    try {
      const curRelease = await this.automationReleaseRepository.findById('current');
      if (curRelease.tagName === release.tag_name) return res.status(400).send({
        error: { message: `iascable is up to date: version ${release.tag_name}` }
      });
    } catch (error) {
      console.log(error);
    }
    
    // Get latest release ZIP archive
    const zip = new AdmZip(await (await fetch(release.zipball_url)).buffer());
    const zipEntries = zip.getEntries();
    const success:Architectures[] = [];
    for (const zipEntry of zipEntries) {
      // Get ref-arch BOMs
      if (!zipEntry.isDirectory && zipEntry.entryName.match(/.*\/ref-arch\/.*.yaml$/g)) {
        const arch_id = zipEntry.name.split(".yaml")[0];
        console.log(`Syncing BOM ${arch_id} from iascable ${release.tag_name}`);
        let arch:Architectures;
        try {
          arch = await this.architecturesRepository.findById(arch_id);
        } catch (error) {
          console.log(`Architecture ${arch_id} does not exist, create it`);
        }
        try {
          arch = await this.importYaml(
            zipEntry.getData().toString(),
            "true",
            true
          );
          success.push(arch);
        } catch (error) {
          console.log(error);
          return res.status(400).send({error: error});
        }
      }
    }

    // Set current release
    try {
      await this.automationReleaseRepository.deleteById('current');
    } catch (error) {
      console.log(error);
    }
    const newRelease = await this.automationReleaseRepository.create({
      id: 'current',
      url: release.url,
      tagName: release.tag_name,
      name: release.name,
      createdAt: release.created_at,
      publishedAt: release.published_at,
      zipballUrl: release.zipball_url,
      body: release.body,
    });
    res.json({
      release: newRelease,
      refArchs: success
    });
  }

  @get('/architectures/public/version')
  async getAutomationRelease(): Promise<AutomationRelease>{
    return this.automationReleaseRepository.findById('current');
  }

  @patch('/architectures/{id}/boms', {
    responses: {
      '200': {
        description: 'Architectures.Bom PATCH success count',
        content: {'application/json': {schema: CountSchema}},
      },
    },
  })
  async patch(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Bom, {partial: true}),
        },
      },
    })
    bom: Partial<Bom>,
    @param.query.object('where', getWhereSchemaFor(Bom)) where?: Where<Bom>,
  ): Promise<Count> {
    return this.architecturesRepository.boms(id).patch(bom, where);
  }

  @del('/architectures/{id}/boms', {
    responses: {
      '200': {
        description: 'Architectures.Bom DELETE success count',
        content: {'application/json': {schema: CountSchema}},
      },
    },
  })
  async delete(
    @param.path.string('id') id: string,
    @param.query.object('where', getWhereSchemaFor(Bom)) where?: Where<Bom>,
  ): Promise<Count> {
    return this.architecturesRepository.boms(id).delete(where);
  }
}
