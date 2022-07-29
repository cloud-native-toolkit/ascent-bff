import {
  Count,
  CountSchema,
  Filter,
  repository,
  Where,
} from '@loopback/repository';
import {inject} from '@loopback/core';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  del,
  requestBody,
  Request,
  response,
  Response,
  RestBindings
} from '@loopback/rest';

// import { writeFileSync } from 'fs';

import {
  Controls,
  ControlDetails
} from '../models';
import {
  ControlsRepository
} from '../repositories';

import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler, File} from '../types';

import { XLSXHelper } from '../xlsx.helper';

/* eslint-disable @typescript-eslint/naming-convention */

const HEADERS = [
  "focus_area",
  "family",
  "nist_functions",
  "id",
  "name",
  "risk_desc",
  "objective",
  "nist_guidance",
  "fs_guidance",
  "requirement_id",
  "requirement_description",
  "fs_params",
  //"requirement_risk_rating",
  "requirement_control_type_1",
  "requirement_control_type_2",
  "requirement_control_type_3",
  //"ibm_public_cloud_scope",
  //"ibm_public_cloud_resp",
  //"developer_scope",
  //"developer_resp",
  //"operator_scope",
  //"operator_resp",
  //"consumer_scope",
  //"consumer_resp",
  //"scc",
  //"scc_goal_id",
  //"scc_goal_desc"
];

interface ParsedItem {
  focus_area?: string;
  family?: string;
  nist_functions?: string;
  id?: string;
  name?: string;
  risk_desc?: string;
  objective?: string;
  fs_guidance?: string;
  fs_params?: string;
  nist_guidance?: string;
  requirement_id?: string;
  requirement_description?: string;
  requirement_risk_rating?: string;
  requirement_control_type_1?: string;
  requirement_control_type_2?: string;
  requirement_control_type_3?: string;
  ibm_public_cloud_scope?: string;
  ibm_public_cloud_resp?: string;
  developer_scope?: string;
  developer_resp?: string;
  operator_scope?: string;
  operator_resp?: string;
  consumer_scope?: string;
  consumer_resp?: string;
  scc?: string;
  scc_goal_id?: string;
  scc_goal_desc?: string;
}

export class ControlsController {

  xlsxHelper: XLSXHelper;

  constructor(
    @repository(ControlsRepository)
    public controlsRepository : ControlsRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler,
  ) {
    this.xlsxHelper = new XLSXHelper();
  }

  @post('/controls')
  @response(200, {
    description: 'Controls model instance',
    content: {'application/json': {schema: getModelSchemaRef(Controls)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Controls, {
            title: 'NewControls'
          }),
        },
      },
    })
    controls: Controls,
  ): Promise<Controls> {
    return this.controlsRepository.create(controls);
  }

  @get('/controls/count')
  @response(200, {
    description: 'Controls model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(Controls) where?: Where<Controls>,
  ): Promise<Count> {
    return this.controlsRepository.count(where);
  }

  @get('/controls')
  @response(200, {
    description: 'Array of Controls model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Controls),
        },
      },
    },
  })
  async find(
    @param.filter(Controls) filter?: Filter<Controls>,
  ): Promise<Controls[]> {
    return this.controlsRepository.find(filter);
  }

  @patch('/controls')
  @response(200, {
    description: 'Controls PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Controls, {partial: true}),
        },
      },
    })
    controls: Controls,
    @param.where(Controls) where?: Where<Controls>,
  ): Promise<Count> {
    return this.controlsRepository.updateAll(controls, where);
  }

  @get('/controls/{id}')
  @response(200, {
    content: {
      'application/json': {
        schema: {
          type: 'object',
        },
      },
    },
    description: 'New controls',
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Controls) filter?: Filter<Controls>,
  ): Promise<Controls> {
    const fltr = filter ?? {include: ['nist', 'services', 'architectures']};
    const control = await this.controlsRepository.findById(id, fltr);
    if (fltr?.include?.includes('nist') && !control.nist && control.parent_control) {
      control.nist = await this.controlsRepository.nist(control.parent_control).get();
    }
    return control;
  }

  @patch('/controls/{id}')
  @response(200, {
    description: 'Controls model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Controls, {includeRelations: true}),
      },
    },
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Controls, {partial: true}),
        },
      },
    }) controls: Controls,
  ): Promise<Controls> {
    await this.controlsRepository.updateById(id, controls);
    return this.controlsRepository.findById(id);
  }

  @del('/controls/{id}')
  @response(204, {
    description: 'Controls DELETE success',
  })
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    await this.controlsRepository.deleteById(id);
  }

  @post('/controls/import')
  @response(200, {
    description: 'Controls model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async importControls(
    @requestBody.file()
    request: Request,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Count> {
    return new Promise<Count>((resolve, reject) => {
      this.fileHandler(request, res, (err: unknown) => {
        if (err) reject(err);
        else {
          let successCount = 0;
          (async () => {
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
            const fileErr = {message: ""};
            if (files.length !== 1) fileErr.message += `You must upload exactly 1 file (received: ${files.length})`;
            else if (!files[0].name.endsWith('.xlsx')) fileErr.message += `Only .xlsx files are supported (received: .${files[0].name.split('.').pop()})`;
            if (fileErr.message) return reject(res.status(400).send({error: fileErr}));
  
            const wb = this.xlsxHelper.read(files[0].buffer, {type:'buffer'});
            const sheet = wb.Sheets['FS Cloud Framework'];
            while(!sheet['A1']?.w .startsWith('#')) {
              this.xlsxHelper.delete_row(sheet, 0);
            }
  
            const parsedItems: ParsedItem[] = this.xlsxHelper.utils.sheet_to_json(sheet, { header: HEADERS });
            const newControls:Controls[] = [];
            let curFocusArea = "";
            let curFamily = "";
            let curControl = new Controls();
            let curControlDetails = new ControlDetails();
            for (const parsedItem of parsedItems) {
              if (parsedItem.focus_area) curFocusArea = parsedItem.focus_area;
              if (parsedItem.family) curFamily = parsedItem.family;
              if (parsedItem.id) {
                // TODO: If defined add cur control to DB
                if (curControl?.id) {
                  newControls.push(curControl);
                  try {
                    await this.controlsRepository.deleteById(curControl.id);
                  } catch (error) {
                    console.error(error);
                  }
                  await this.controlsRepository.create(curControl);
                  try {
                    await this.controlsRepository.controlDetails(curControl.id).delete();
                  } catch (error) {
                    console.error(error);
                  }
                  await this.controlsRepository.controlDetails(curControl.id).create(curControlDetails);
                  successCount += 1;
                }
                // Setup new cur control
                let existingControl 
                try {
                  existingControl = await this.controlsRepository.findById(parsedItem.id, { include: [ 'controlDetails' ] });
                } catch (error) {
                  console.log(error);
                }
                const match = parsedItem.id.match(/([A-Z]{1,3}-[0-9]{1,2}) \([0-9]{1,2}\)/);
                curControl = new Controls({
                  id: parsedItem.id,
                  family: curFamily || existingControl?.family,
                  name: parsedItem.name,
                  base_control: match === null,
                  control_item: false,
                  parent_control: match !== null ? match[1] : undefined
                });
                curControlDetails = new ControlDetails({
                  id: parsedItem.id,
                  name: parsedItem.name,
                  focus_area: curFocusArea,
                  family: curFamily,
                  nist_functions: parsedItem.nist_functions,
                  risk_desc: parsedItem.risk_desc,
                  objective: parsedItem.objective,
                  fs_guidance: parsedItem.fs_guidance,
                  fs_params: parsedItem.fs_params,
                  nist_guidance: parsedItem.nist_guidance,
                  implementation: existingControl?.controlDetails?.implementation,
                  requirements: []
                });
              }
              if (parsedItem.requirement_id && curControl) curControlDetails?.requirements?.push({
                id: parsedItem.requirement_id,
                description: parsedItem.requirement_description,
                risk_rating: parsedItem.requirement_risk_rating,
                control_type_1: parsedItem.requirement_control_type_1,
                control_type_2: parsedItem.requirement_control_type_2,
                control_type_3: parsedItem.requirement_control_type_3,
                ibm_public_cloud_scope: parsedItem.ibm_public_cloud_scope,
                ibm_public_cloud_resp: parsedItem.ibm_public_cloud_resp,
                developer_scope: parsedItem.developer_scope,
                developer_resp: parsedItem.developer_resp,
                operator_scope: parsedItem.operator_scope,
                operator_resp: parsedItem.operator_resp,
                consumer_scope: parsedItem.consumer_scope,
                consumer_resp: parsedItem.consumer_resp,
                scc: parsedItem.scc,
              });
            }
            if (curControl?.id) {
              newControls.push(curControl);
              try {
                await this.controlsRepository.deleteById(curControl.id);
              } catch (error) {
                console.error(error);
              }
              await this.controlsRepository.create(curControl);
              try {
                await this.controlsRepository.controlDetails(curControl.id).delete();
              } catch (error) {
                console.error(error);
              }
              await this.controlsRepository.controlDetails(curControl.id).create(curControlDetails);
              successCount += 1;
            }
            // writeFileSync('new-controls.ignore.json', JSON.stringify(newControls));
          })()
          .then(() => resolve({count: successCount}))
          .catch((error) => {
            reject(res.status(400).send({error: error}))
          });
        }
      });
    });
  }
}
