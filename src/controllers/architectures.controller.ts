import {
  Count,
  CountSchema,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import { inject } from "@loopback/core";
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  del,
  oas,
  Request,
  requestBody,
  response,
  RestBindings,
  Response
} from '@loopback/rest';
import { Architectures } from '../models';
import {
  ArchitecturesRepository,
  UserRepository
} from '../repositories';
import { FILE_UPLOAD_SERVICE } from '../keys';
import { FileUploadHandler, File } from '../types';
import { IascableService } from '../services/iascable.service';

import * as _ from 'lodash';
import { Services } from '../appenv';
import * as Storage from "ibm-cos-sdk"
import assert from "assert";
import yaml from 'js-yaml';

import Jimp from "jimp";

import util from 'util';
import { Inject } from 'typescript-ioc';

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */

export enum DiagramType {
  DRAWIO = "drawio",
  PNG = "png"
}

const INSTANCE_ID = process.env.INSTANCE_ID;

export class ArchitecturesController {

  @Inject iascableService!: IascableService;
  private cos: Storage.S3;
  private bucketName: Storage.S3.BucketName;

  constructor(
    @repository(ArchitecturesRepository)
    public architecturesRepository: ArchitecturesRepository,
    @repository(UserRepository)
    public userRepository: UserRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler,
  ) {

    // console.log("Constructor for Architecture API")

    if (process.env.NODE_ENV !== 'test') {

      // Load Information from Environment
      const services = Services.getInstance();

      // The services object is a map named by service so we extract the one for MongoDB
      const storageServices: any = services.getService('storage');

      // This check ensures there is a services for MongoDB databases
      assert(!_.isUndefined(storageServices), 'backend must be bound to storage service');

      if (_.isUndefined(storageServices)) {
        console.log("Failed to load Storage sdk")
        return;
      }

      // Connect to Object Storage
      const config = {
        endpoint: storageServices.endpoints,
        apiKeyId: storageServices.apikey,
        serviceInstanceId: storageServices.resource_instance_id,
        signatureVersion: 'iam',
      };

      this.cos = new Storage.S3(config);
      this.bucketName = `ascent-storage-${INSTANCE_ID}`;
      if (this.cos) this.cos.listBuckets().promise()
        .then(data => {
          if (!data?.Buckets?.find(bucket => bucket.Name === this.bucketName)) {
            this.cos.createBucket({
              Bucket: this.bucketName,
              CreateBucketConfiguration: {
                LocationConstraint: 'eu-geo'
              }
            }).promise()
              .then(() => {
                console.log(`Bucket ${this.bucketName} created.`);
              })
              .catch(function (err) {
                console.error(util.inspect(err));
              });
          }
        })
        .catch(function (err) {
          console.error(util.inspect(err));
        });
    }
  }

  public async getDiagram(arch_id: string, diagramType: DiagramType, small = false): Promise<Storage.S3.Body> {
    return new Promise((resolve, reject) => {
      if (this.cos) this.cos.getObject({
        Bucket: this.bucketName,
        Key: `diagrams/${diagramType}/${small ? "small-" : ""}${arch_id}-diagram.${diagramType}`
      }).promise()
        .then((data) => {
          if (data?.Body) {
            return resolve(data.Body);
          }
          return reject({
            error: {
              message: `Error retrieving diagram`,
              details: data
            }
          });
        }, (error) => {
          if (error?.code === "NoSuchKey") {
            return this.cos.getObject({
              Bucket: this.bucketName,
              Key: `diagrams/${diagramType}/${small ? "small-" : ""}placeholder.${diagramType}`
            }).promise()
              .then((data) => {
                if (data?.Body) {
                  return resolve(data.Body);
                }
                return reject({
                  error: {
                    message: `Error retrieving diagram`,
                    details: data
                  }
                });
              }, (e) => {
                return reject({
                  error: {
                    message: `Error retrieving diagram`,
                    details: e
                  }
                });
              })
              .catch((e) => reject({
                error: {
                  message: `Error retrieving diagram`,
                  details: e
                }
              }));
          }
          return reject({
            error: {
              message: `Error retrieving diagram`,
              details: error
            }
          });
        })
        .catch((e) => {
          return reject({
            error: {
              message: `Error retrieving diagram`,
              details: e
            }
          });
        });
      else resolve('')
    });
  }

  @get('/architectures/{id}/diagram/{type}')
  @response(200, {
    description: 'Get architecture diagram (.drawio or .png)',
  })
  @oas.response.file()
  async findDiagramById(
    @param.path.string('id') arch_id: string,
    @param.query.boolean('small') small: boolean,
    @param.path.string('type') fileType: DiagramType,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<any> {
    if (fileType !== DiagramType.DRAWIO && fileType !== DiagramType.PNG) {
      return res.status(400).send({
        error: {
          message: `Diagram type must be either "drawio" or "png"`
        }
      });
    }
    const arch = await this.architecturesRepository.findById(arch_id);
    return new Promise((resolve, reject) => {
      this.getDiagram(arch.arch_id, fileType, small)
        .then((data) => {
          return resolve(data);
        }, (error => {
          return reject(res.status(400).send(error));
        }))
        .catch(getErr => {
          return reject(res.status(400).send({
            error: {
              message: `Error retrieving diagram`,
              details: getErr
            }
          }));
        });
    });
  }

  private async putDiagrams(files: File[], arch_id: string): Promise<object> {
    const error = { message: "" };
    if (files.length < 1 || files.length > 2) error.message += "You must upload 1 or 2 files. ";
    if (files.find((f) => (f.fieldname !== "drawio" && f.fieldname !== "png"))) error.message += "Only .drawio and .png files are accepted. ";
    if (files.find((f) => f.size > 2000 * 1024)) error.message += "File too large (must me <= 2MiB) ";
    const pngIx = files.findIndex(f => f.fieldname === "png");
    if (pngIx >= 0) {
      // fs.writeFileSync('/tmp/arch.png', files[pngIx].buffer);
      const image = await Jimp.read(files[pngIx].buffer);
      image.resize(Jimp.AUTO, 200);
      const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
      files.push({
        mimetype: files[pngIx].mimetype,
        buffer: buffer,
        size: buffer.length,
        fieldname: files[pngIx].fieldname,
        name: `png-small`
      });
    }
    return new Promise((resolve, reject) => {
      if (error.message) return reject({ error: error });
      let fileIx = 0;
      const errors: object[] = [];
      for (const file of files) {
        if (this.cos) this.cos.putObject({
          Bucket: this.bucketName,
          Key: `diagrams/${file.fieldname}/${(file.name === "png-small") ? "small-" : ""}${arch_id}-diagram.${file.fieldname}`,
          Body: file.buffer
        }, (err) => {
          if (err) {
            errors.push(err);
          }
          if (++fileIx === files.length) {
            if (err) return reject({ error: errors });
            return resolve({});
          }
        });
        else resolve({});
      }
    });
  }

  @post('/architectures/{id}/diagram')
  @response(204, {
    description: 'Diagram import success',
  })
  async postDiagram(
    @param.path.string('id') arch_id: string,
    @requestBody.file() request: Request,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<void> {
    const arch = await this.architecturesRepository.findById(arch_id, { include: ['owners'] });
    return new Promise((resolve, reject) => {
      this.fileHandler(request, res, (err: unknown) => {
        if (err) reject({ error: err });
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
          this.putDiagrams(files, arch.arch_id)
            .then((putErr) => {
              if (putErr) return reject(res.status(400).send(putErr));
              return resolve();
            })
            .catch(putErr => {
              return reject(res.status(400).send(putErr));
            });
        }
      });
    });
  }

  @post('/architectures')
  @response(200, {
    description: 'Architectures model instance',
    content: { 'application/json': { schema: getModelSchemaRef(Architectures) } },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Architectures, {
            title: 'NewArchitectures',

          }),
        },
      },
    })
    architectures: Architectures,
    @inject(RestBindings.Http.REQUEST) req: any,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Architectures> {
    return new Promise((resolve, reject) => {
      if (architectures.yaml) {
        try {
          yaml.load(architectures.yaml);
        } catch (error) {
          return reject(res.status(400).send({
            error: {
              message: "Wrong yaml format for automation variables",
              details: error
            }
          }));
        }
      }
      const user: any = req?.user;
      const email: string = user?.email;
      if (email) this.userRepository.architectures(email).create(architectures)
        .then((arch) => {
          resolve(arch);
        })
        .catch((err) => {
          reject({ error: err });
        });
      else return resolve(this.architecturesRepository.create(architectures));
    });
  }

  @get('/architectures/count')
  @response(200, {
    description: 'Architectures model count',
    content: { 'application/json': { schema: CountSchema } },
  })
  async count(
    @param.where(Architectures) where?: Where<Architectures>,
  ): Promise<Count> {
    return this.architecturesRepository.count(where);
  }

  @get('/architectures')
  @response(200, {
    description: 'Array of Architectures model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Architectures, { includeRelations: true }),
        },
      },
    },
  })
  async find(): Promise<Architectures[]> {
    const catalog = await this.iascableService.getCatalog();
    const archs = (await this.architecturesRepository.find({ include: ["owners"], where: { public: true } })).filter(arch => catalog.boms.findIndex(catEntry => catEntry.name === arch.arch_id) >= 0);
    return archs;
  }

  @patch('/architectures')
  @response(200, {
    description: 'Architectures PATCH success count',
    content: { 'application/json': { schema: CountSchema } },
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Architectures, { partial: true }),
        },
      },
    })
    architectures: Architectures,
    @inject(RestBindings.Http.RESPONSE) res: Response,
    @param.where(Architectures) where?: Where<Architectures>,
  ): Promise<Count> {
    return new Promise((resolve, reject) => {
      if (architectures.yaml) {
        try {
          yaml.load(architectures.yaml);
        } catch (error) {
          return reject(res.status(400).send({
            error: {
              message: "Wrong yaml format for automation variables",
              details: error
            }
          }));
        }
      }
      return resolve(this.architecturesRepository.updateAll(architectures, where));
    });
  }

  @get('/architectures/{id}')
  @response(200, {
    description: 'Architectures model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Architectures, { includeRelations: true }),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Architectures, { exclude: 'where' }) filter?: FilterExcludingWhere<Architectures>
  ): Promise<Architectures> {
    return this.architecturesRepository.findById(id, filter);
  }

  @patch('/architectures/{id}')
  @response(200, {
    description: 'Architectures model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Architectures, { includeRelations: true }),
      },
    },
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Architectures, { partial: true }),
        },
      },
    })
    architectures: Architectures,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Architectures> {
    return new Promise((resolve, reject) => {
      if (architectures.yaml) {
        try {
          yaml.load(architectures.yaml);
        } catch (error) {
          return reject(res.status(400).send({
            error: {
              message: "Wrong yaml format for automation variables",
              details: error
            }
          }));
        }
      }
      this.architecturesRepository.updateById(id, architectures)
        .then(() => {
          return resolve(this.architecturesRepository.findById(id));
        })
        .catch((err) => {
          return reject(err);
        });
    });
  }

  @del('/architectures/{id}')
  @response(204, {
    description: 'Architectures DELETE success',
  })
  async deleteById(
    @param.path.string('id') id: string,
  ): Promise<void> {
    await this.architecturesRepository.boms(id).delete();
    for (const owner of await this.architecturesRepository.owners(id).find()) {
      await this.architecturesRepository.owners(id).unlink(owner.email);
    }
    await this.architecturesRepository.deleteById(id);
  }

  @post('/architectures/{id}/duplicate')
  @response(200, {
    description: 'Architectures model instance',
    content: { 'application/json': { schema: getModelSchemaRef(Architectures) } },
  })
  async duplicate(
    @param.path.string('id') arch_id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Architectures, {
            partial: true,
            exclude: ['short_desc', 'long_desc', 'public', 'production_ready', 'yaml']
          }),
        },
      },
    })
    archDetails: Architectures,
    @inject(RestBindings.Http.REQUEST) req: any,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Architectures> {
    // Duplicate architecture entity
    const existingArch = await this.architecturesRepository.findById(arch_id);
    let newArch = new Architectures({
      arch_id: archDetails.arch_id,
      name: archDetails.name,
      short_desc: existingArch.short_desc,
      long_desc: existingArch.long_desc,
      public: false,
      production_ready: existingArch.production_ready,
      yaml: existingArch.yaml
    })
    const user: any = req?.user;
    const email: string = user?.email;
    if (email) newArch = await this.userRepository.architectures(email).create(newArch);
    else newArch = await this.architecturesRepository.create(newArch);
    // Duplicate architecture BOMs
    const existingBoms = await this.architecturesRepository.boms(arch_id).find();
    for (const bom of existingBoms) {
      bom.arch_id = archDetails.arch_id;
      delete bom._id;
      await this.architecturesRepository.boms(archDetails.arch_id).create(bom);
    }
    // Duplicate architecture diagrams
    if (this.cos) try {
      const diagramPng = await this.cos.getObject({
        Bucket: this.bucketName,
        Key: `diagrams/png/${arch_id}-diagram.png`
      }).promise();
      await this.cos.putObject({
        Bucket: this.bucketName,
        Key: `diagrams/png/${archDetails.arch_id}-diagram.png`,
        Body: diagramPng.Body
      }).promise();
    } catch (error) {
      console.log(`Error duplicating ${arch_id} PNG diagram: `, error);
    }
    if (this.cos) try {
      const diagramPngSmall = await this.cos.getObject({
        Bucket: this.bucketName,
        Key: `diagrams/png/small-${arch_id}-diagram.png`
      }).promise();
      await this.cos.putObject({
        Bucket: this.bucketName,
        Key: `diagrams/png/small-${archDetails.arch_id}-diagram.png`,
        Body: diagramPngSmall.Body
      }).promise();
    } catch (error) {
      console.log(`Error duplicating ${arch_id} small PNG diagram: `, error);
    }
    if (this.cos) try {
      const diagramDrawio = await this.cos.getObject({
        Bucket: this.bucketName,
        Key: `diagrams/drawio/${arch_id}-diagram.drawio`
      }).promise();
      await this.cos.putObject({
        Bucket: this.bucketName,
        Key: `diagrams/drawio/${archDetails.arch_id}-diagram.drawio`,
        Body: diagramDrawio.Body
      }).promise();
    } catch (error) {
      console.log(`Error duplicating ${arch_id} DRAWIO diagram: `, error);
    }
    return newArch;
  }
}
