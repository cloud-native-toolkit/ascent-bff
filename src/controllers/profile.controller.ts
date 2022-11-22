import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {inject} from '@loopback/core';
import {
  param,
  get,
  post,
  getModelSchemaRef,
  Request,
  requestBody,
  response,
  Response,
  RestBindings
} from '@loopback/rest';
import {parse} from 'csv-parse';
import { Profile, ControlMapping } from '../models';
import { ProfileRepository, ControlMappingRepository, GoalRepository } from '../repositories';

import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler, File} from '../types';

import { tagsMapping } from '../tags-mapping';

/* eslint-disable @typescript-eslint/naming-convention */
  
export class ProfileController {
  constructor(
    @repository(ProfileRepository)
    public profileRepository : ProfileRepository,
    @repository(ControlMappingRepository)
    public mappingRepository : ControlMappingRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler,
    @repository(GoalRepository)
    public goalRepository : GoalRepository
  ) {}

  @get('/mapping/profiles/count')
  @response(200, {
    description: 'Profile model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(Profile) where?: Where<Profile>,
  ): Promise<Count> {
    return this.profileRepository.count(where);
  }

  @get('/mapping/profiles')
  @response(200, {
    description: 'Array of Profile model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Profile, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(Profile) filter?: Filter<Profile>,
  ): Promise<Profile[]> {
    return this.profileRepository.find(filter);
  }

  @post('/mapping/profiles/import', {
    responses: {
      200: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
            },
          },
        },
        description: 'New profile and mappings',
      },
    },
  })
  async uploadProfile(
    @requestBody.file()
    request: Request,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<object> {
    return new Promise<object>((resolve, reject) => {
      this.fileHandler(request, res, (err: unknown) => {
        if (err) reject(err);
        else {
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
          const error = {message: ""};
          if (files.length !== 1) error.message += "You must upload 1 file. ";
          if (files.length === 1 && files[0].mimetype !== "text/csv") error.message += "File format must be CSV. ";
          if (files.length === 1 && files[0].size > 102400) error.message += "File too large (must me <= 100Ko) ";
          if (error.message) return reject(res.status(400).send({error: error}))
          const csv = files[0].buffer.toString().split('"##METAINFO ENDS##"\n')
          if (csv.length !== 2) error.message += "Wrong file fromat, you must import a profile from IBM Security and Compliance Center. ";
          if (error.message) return reject(res.status(400).send({error: error}))
          let profile = csv[0];
          profile = profile.replace(new RegExp(",","g"), ":");
          profile = profile.replace(/\n"/gi, ',"');
          profile = "{" + profile + "}";
          const profileObj = JSON.parse(profile);
          this.profileRepository.create(new Profile({
            id: profileObj.profilemnemonic,
            name: profileObj.profilename,
            description: profileObj.profiledescription
          }))
          .then((newProfile) => {
            parse(csv[1], {columns: true}, (parseErr, records, info) => {
              for (const ix in records) {
                // Control ID parsing
                let externalControlId:string = records[ix].ExternalControlId;
                externalControlId = externalControlId.replace(/([A-Z]{2,3}-[0-9]{1,2})((?:[(][0-9]{1,2}[)]))/gi, "$1 $2");
                externalControlId = externalControlId.replace(/([A-Z]{2,3}-[0-9]{1,2}(?: [(][0-9]{1,2}[)])?)-0/gi, "$1");
                externalControlId = externalControlId.replace(/([A-Z]{2,3}-[0-9]{1,2}(?: [(][0-9]{1,2}[)])?)((?:\([a-z]\))+)/gi, "$1:$2");
                const controlId = externalControlId.split(/:/gi);
                const tags = records[ix].Tags.split(",");
                for (const tagIx in tags) {
                  const tagMapping = tagsMapping.find(element => element.tag === tags[tagIx]);
                  tagMapping?.service_ids.forEach(serviceId => {
                    if (serviceId) {
                      const mapping = new ControlMapping({
                        control_id: controlId[0],
                        service_id: serviceId,
                        control_subsections: controlId[1] || undefined,
                        desc: records[ix].Description,
                        scc_profile: newProfile.id
                      });
                      this.mappingRepository.create(mapping)
                      .then((newMapping) => {
                        for (const goalId of records[ix].ControlId.split(',')) {
                          this.mappingRepository.goals(newMapping.id).link(goalId).catch(console.error);
                        }
                      })
                      .catch(createMappingErr => {
                        console.log(createMappingErr);
                      });
                    }
                  });
                }
              }
              return resolve(newProfile);
            });
          })
          .catch(createProfileErr => {
            if (createProfileErr?.keyValue?._id) {
              return reject(res.status(409).send({
                error: {
                  message: `Profile "${createProfileErr.keyValue._id}" already exists.`
                }
              }));
            } else {
              return reject(res.status(409).send({error: createProfileErr}));
            }
          });
        }
      });
    });
  }

  @get('/mapping/profiles/{id}')
  @response(200, {
    description: 'Profile model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Profile, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Profile, {exclude: 'where'}) filter?: FilterExcludingWhere<Profile>
  ): Promise<Profile> {
    return this.profileRepository.findById(id, filter);
  }

}
  