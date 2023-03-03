import {
  Filter,
  FilterExcludingWhere,
  repository,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  patch,
  del,
  oas,
  requestBody,
  RestBindings,
  Request,
  Response
} from '@loopback/rest';
import {inject} from "@loopback/core";

import * as _ from 'lodash';
import assert from "assert";
import * as Storage from "ibm-cos-sdk"

import  AdmZip = require("adm-zip");

import { AutomationCatalogController } from '../controllers';

import yaml from 'js-yaml';

import { Inject } from 'typescript-ioc';
import {Services} from '../appenv';

import {
  Architectures,
  Solution
} from '../models';
import {
  SolutionRepository,
  UserRepository,
  ServicesRepository,
  ArchitecturesRepository
} from '../repositories';
import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler, File} from '../types';
import { IascableService } from '../services/iascable.service';
import axios from 'axios';

/* eslint-disable @typescript-eslint/no-explicit-any */

const INSTANCE_ID = process.env.INSTANCE_ID;
const BUCKET_NAME = `ascent-storage-${INSTANCE_ID}`;

interface PostBody {
  solution: Solution,
  architectures: Architectures[],
  solutions: string[],
  platform: string
}

export class SolutionController {

  @Inject iascableService!: IascableService;
  private cos : Storage.S3;
  private automationCatalogController: AutomationCatalogController;

  constructor(
    @repository(SolutionRepository)
    public solutionRepository : SolutionRepository,
    @repository(UserRepository)
    public userRepository : UserRepository,
    @repository(ArchitecturesRepository)
    public architecturesRepository : ArchitecturesRepository,
    @repository(ServicesRepository)
    public servicesRepository : ServicesRepository,
    @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler,
  ) {

    this.automationCatalogController = new AutomationCatalogController(this.architecturesRepository, this.servicesRepository, this.userRepository, this.fileHandler);

    if (process.env.NODE_ENV !== 'test') {
      // Load Information from Environment
      const services = Services.getInstance();
  
      // The services object is a map named by service so we extract the one for MongoDB
      const storageServices:any = services.getService('storage');
  
      // This check ensures there is a services for MongoDB databases
      assert(!_.isUndefined(storageServices), 'backend must be bound to storage service');
  
      if (_.isUndefined(storageServices)){
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
    }

  }

  importYaml = async (
    yamlString:string,
    overwrite: string,
    publicSol: boolean,
    email?: string,
  ) => {
    const solution = await this.iascableService.parseSolutionYaml(yamlString, publicSol);
    // Try to get corresponding solution
    let curSol:Solution;
    let solExists = false;
    try {
      curSol = await this.solutionRepository.findById(solution.id);
      if (!curSol) throw new Error();
      solExists = true;
    } catch (getArchError) {
      console.log(`Solution ${solution.id} does not exist, creating it...`);
    }
    // eslint-disable-next-line no-throw-literal
    if (solExists && !overwrite) throw { message: `Solution ${solution.id} already exists. Set 'overwrite' parameter to overwrite.` };
    // Delete Existing Solution
    if (solExists) await this.solutionRepository.deleteById(solution.id);
    // Create solution
    if (email) await this.userRepository.solutions(email).create(solution);
    else await this.solutionRepository.create(solution);
    // Bind boms to solution
    for (const bom of yaml.load(yamlString).spec.stack) {
      try {
        await this.solutionRepository.architectures(solution.id).link(bom.name);
      } catch (error) {
        console.log(`Error linking ${bom.name} to solution ${solution.id}`, error);
      }
    }
    return solution;
  }

  @post('/solutions')
  async create (
    @requestBody()
    body: PostBody,
    @inject(RestBindings.Http.REQUEST) req: any,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ) : Promise<Solution|object> {
    const user:any = req?.user;
    const email:string = user?.email;
    let newSolution:Solution;
    if (body?.solution?.yaml) {
      try {
        yaml.load(body?.solution?.yaml);
      } catch (error) {
        return res.status(400).send({
          error: {
            message: "Error parsing solution yaml",
            details: error
          }
        });
      }
    }
    try {
      if (email) newSolution = await this.userRepository.solutions(email).create(body.solution);
      else newSolution = await this.solutionRepository.create(body.solution);
    } catch (error:any) {
      console.log(error)
      return res.status(400).send({error: {message: error?.code === 11000 ? `Solution ${body.solution.id} already exists.` : "Error creating solution", details: error}});
    }

    // Bind BOMs to solution
    let boms:string[] = body.architectures.map(a => a.arch_id);
    if (body.solutions) for (const sol of body.solutions) {
      boms = [...boms, ...(await this.iascableService.solutionBoms(sol))];
    }
    const archsWithDetails = [];
    boms = Array.from(new Set(boms)).sort((a,b) => a < b ? -1 : 1);
    for (const bom of boms) {
      await this.solutionRepository.architectures(newSolution.id).link(bom);
      try {
        const archObj = await this.architecturesRepository.findById(bom);
        archsWithDetails.push({ ...archObj, type: yaml.load(archObj.yaml)?.metadata?.labels?.type });
      } catch (error) {
        console.log(error);
      }
    }
    // Creates default README
    const readme = `
# Solution: ${newSolution.name}

This collection of terraform automation bundles has been crafted from a set of Terraform modules created by Ecosytem Lab team part of the IBM Strategic Partnership.

If you have any question please reach out to us on [Discord](https://discord.gg/7sSY9W2cZf).

## Change Log

- **${new Date().toDateString()}** - Initial version

## Description

${newSolution.long_desc ? newSolution.long_desc : newSolution.short_desc ? newSolution.short_desc : 'Update this section to describe your solution'}

## Bill Of Materials

The following is a list of the bill of materials used as part of this solution:

### Infrastructure

| ID | Name | Description | 
| -- | ---- | ----------- |
${archsWithDetails.filter(arch => arch.type !== 'software').map(arch => `| ${arch.arch_id} | [${arch.name}](https://builder.cloudnativetoolkit.dev/boms/${arch.arch_id}) | ${arch.short_desc} |`).join('\n')}

### Software

| ID | Name | Description | 
| -- | ---- | ----------- |
${archsWithDetails.filter(arch => arch.type === 'software').map(arch => `| ${arch.arch_id} | [${arch.name}](https://builder.cloudnativetoolkit.dev/boms/${arch.arch_id}) | ${arch.short_desc} |`).join('\n')}


This solution was built with the [Techzone Deployer](https://builder.techzone.ibm.com).

    `
    // Put default readme for solution
    try {
      await new Promise((resolve, reject) => {
        if (this.cos) this.cos.putObject({
          Bucket: BUCKET_NAME,
          Key: `solutions/${newSolution.id}/README.md`,
          Body: Buffer.from(readme)
        }, (putObjErr) => {
          if (putObjErr) {
            reject({error: putObjErr})
          }
          console.log('README added')
          return resolve('ok');
        });
        else resolve('ok');
      });
    } catch (error) {
      console.log(error);
    }
    return this.solutionRepository.findById(newSolution.id, {include: ['architectures']});
  }

  @post('/solutions/{id}/files')
  async uploadFiles(
    @param.path.string('id') id: string,
    @requestBody.file() request: Request,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<void> {
    await this.solutionRepository.findById(id, {include: ['owners']});
    return new Promise((resolve, reject) => {
      this.fileHandler(request, res, (err: unknown) => {
        if (err) reject({error: err});
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
          // Create Buckett and upload files to COS
          let fileIx = 0;
          const errors:object[] = [];
          for (const file of files) {
            if (this.cos) this.cos.putObject({
              Bucket: BUCKET_NAME,
              Key: `solutions/${id}/${file.name}`,
              Body: file.buffer
            }, (putObjErr) => {
              if (err) {
                errors.push(putObjErr);
              }
              if (++fileIx === files.length) {
                if (err) return reject({error: errors});
                return resolve();
              }
            });
            else if (++fileIx === files.length) return resolve();
          }
        }
      });
    });
  }

  @get('/solutions')
  async find(
    @param.filter(Solution) filter?: Filter<Solution>,
  ): Promise<Solution[]> {
    // Only get public solutions
    const publicFilter = {
      ...filter,
      where: {
        ...filter?.where,
        public: true
      }
    }
    const catalog = await this.iascableService.getCatalog();
    const solutions = (await this.solutionRepository.find(publicFilter)).filter(sol => catalog.boms.findIndex(catEntry => catEntry.name === sol.id) >= 0);
    return solutions;
  }

  @get('/solutions/{id}')
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Solution, {exclude: 'where'}) filter?: FilterExcludingWhere<Solution>
  ): Promise<any> {
    const solution:any = JSON.parse(JSON.stringify(await this.solutionRepository.findById(id, filter)));
    try {
      let solObjects = this.cos ? (await this.cos.listObjects({Bucket: BUCKET_NAME}).promise()).Contents : [];
      if (solObjects) {
        solObjects = solObjects.filter(obj => obj.Key?.startsWith(`solutions/${id}/`));
        for (const obj of solObjects) {
          obj.Key = obj.Key?.replace(`solutions/${id}/`, '');
        }
      }
      solution.files = solObjects;
    } catch (error) {
      console.log(error);
    }
    console.log(solution);
    return solution;
  }

  @get('/solutions/{id}/files/{filename}')
  @oas.response.file()
  async getFile(
    @param.path.string('id') id: string,
    @param.path.string('filename') filename: string,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<any> {
    try {
      return this.cos ? (await this.cos.getObject({
        Bucket: BUCKET_NAME,
        Key: `solutions/${id}/${filename}`
      }).promise()).Body : '';
    } catch (error) {
      return res.status(400).send({error: {
        message: `Could not fetch file ${filename} for solution ${id}`,
        details: error
      }})
    }
  }

  @get('/solutions/{id}/files.zip')
  @oas.response.file()
  async getFiles(
    @param.path.string('id') id: string,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<any> {
    try {
      const zip = new AdmZip();

      // Add files from COS
      let objects = this.cos ? (await this.cos.listObjects({
        Bucket: BUCKET_NAME
      }).promise()).Contents : [];
      if (objects) {
        objects = objects.filter(file => file.Key?.startsWith(`solutions/${id}/`));
      }
      if (objects) for (const object of objects) {
        if (object.Key) {
          const cosObj = this.cos ? (await this.cos.getObject({
            Bucket: BUCKET_NAME,
            Key: object.Key
          }).promise()).Body : [];
          if (cosObj) zip.addFile(object.Key?.replace(`solutions/${id}/`, ''), new Buffer(cosObj.toString()));
        }
      }

      return zip.toBuffer();
    } catch (error) {
      return res.status(400).send({error: {
        message: `Could not fetch files for solution ${id}`,
        details: error
      }})
    }
  }

  @get('/solutions/{id}/automation')
  @oas.response.file()
  async downloadAutomationZip(
      @param.path.string('id') id: string,
      @inject(RestBindings.Http.RESPONSE) res: Response,
  ) {

    // Check if we have a bom ID
    if (_.isUndefined(id)) {
      return res.sendStatus(404);
    }

    // Read the Architecture Data
    const solution = await this.solutionRepository.findById(id, { include: ['architectures'] });

    if (_.isEmpty(solution)) {
      return res.sendStatus(404);
    }

    try {

      // Create zip
      // const zip = new AdmZip();

      return await this.iascableService.buildSolution(solution);

      // // Add files from COS
      // try {
      //   let objects = this.cos ? (await this.cos.listObjects({
      //     Bucket: BUCKET_NAME
      //   }).promise()).Contents : [];
      //   if (objects) {
      //     objects = objects.filter(file => file.Key?.startsWith(`solutions/${id}/`));
      //   }
      //   if (objects) for (const object of objects) {
      //     if (object.Key) {
      //       const cosObj = this.cos ? (await this.cos.getObject({
      //         Bucket: BUCKET_NAME,
      //         Key: object.Key
      //       }).promise()).Body : '';
      //       if (cosObj) zip.addFile(object.Key?.replace(`solutions/${id}/`, ''), new Buffer(cosObj.toString()));
      //     }
      //   }
      // } catch (error) {
      //   console.log(error);
      // }

      // console.log(zip.getEntries().map(entry => entry.entryName));

      // return zip.toBuffer();

    } catch (e:any) {
      console.log(e);
      return res.status(409).send(e?.message);
    }

  }

  @patch('/solutions/{id}')
  async updateById(
    @param.path.string('id') id: string,
    @requestBody()
    body: PostBody,
    @inject(RestBindings.Http.REQUEST) req: any,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Solution|object> {
    if (body?.solution?.yaml) {
      try {
        yaml.load(body?.solution?.yaml);
      } catch (error) {
        return res.status(400).send({
          error: {
            message: "Error parsing solution yaml",
            details: error
          }
        });
      }
    }
    await this.solutionRepository.updateById(id, body.solution);
    if (body.architectures?.length) {
      for (const arch of await this.solutionRepository.architectures(id).find()) {
        await this.solutionRepository.architectures(id).unlink(arch.arch_id);
      }
      for (const arch of body.architectures) {
        await this.solutionRepository.architectures(id).link(arch.arch_id);
      }
    }
    return this.solutionRepository.findById(id, {include: ['architectures']});
  }

  @del('/solutions/{id}')
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    try {
      // Delete all objects in solution bucket
      const objs = this.cos ? (await this.cos.listObjects({
        Bucket: BUCKET_NAME
      }).promise()).Contents?.filter(obj => obj.Key?.startsWith(`solutions/${id}/`))?.filter(obj => obj.Key) : [];
      if (objs && this.cos) await this.cos.deleteObjects({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: objs.map((obj => ({ Key: obj.Key ?? '' })))
        }
      }).promise();
    } catch (error) {
      console.log(error);
    }
    // console.log(res.$response.data);
    for (const arch of await this.solutionRepository.architectures(id).find()) {
      await this.solutionRepository.architectures(id).unlink(arch.arch_id);
    }
    await this.solutionRepository.deleteById(id);
  }

  @get('/solutions/{id}/automation/techzone')
  @oas.response.file()
  downloadAutomationTechzone(
      @param.path.string('id') id: string,
      @inject(RestBindings.Http.RESPONSE) res: Response,
  ) {

    try {
      const bifrostURL = process.env.BIFROST;
      if (bifrostURL === undefined) {
        throw Error("Bifrost URL is invalid.")
      }
      return bifrostURL;
    } catch (e:any) {
      console.log(e);
      return res.status(409).send(e?.message);
    }

  }

  @post('/solutions/public/sync')
  async syncSolutions(): Promise<Solution[]> {
    const cat = await this.iascableService.getBoms();
    const res:Solution[] = [];
    for (const catEntry of cat) {
      if (catEntry.type === 'solution') {
        console.log(`Syncing ${catEntry.name}`);
        const yamlString:string = await (await axios.get(catEntry?.versions[0].metadataUrl ?? '')).data;
        res.push(await this.importYaml(yamlString, 'true', true));
      }
    }
    return res;
  }
}
