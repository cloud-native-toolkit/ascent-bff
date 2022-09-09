import { Inject } from 'typescript-ioc';

import * as Superagent from 'superagent';
import AdmZip = require("adm-zip");
import fs from "fs";

import {
    CatalogBuilder,
    billOfMaterialFromYaml,
    BillOfMaterialModel,
    BillOfMaterialModule,
    Catalog,
    CatalogCategoryModel,
    CatalogLoader,
    ModuleSelector,
    OutputFile,
} from '@cloudnativetoolkit/iascable';

import {
    createNodeRedisClient,
    WrappedNodeRedisClient
} from 'handy-redis';

import yaml from 'js-yaml';

import catalogConfig from '../config/catalog.config'
import { Architectures, Bom, Controls } from '../models';

import first from '../util/first';
import { semanticVersionDescending, semanticVersionFromString } from '../util/semantic-version';
import { S3 } from 'ibm-cos-sdk';

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-throw-literal */

const catalogUrl = catalogConfig.url;

const CATALOG_KEY = 'automation-catalog';
const MODULES_KEY = 'automation-modules';

export interface BomModule {
    name?: string;
    alias?: string;
    variables?: object[];
    dependencies?: object[];
}

export interface CatExt extends CatalogCategoryModel {
    categoryName?: string;
}

export interface ModuleSummary {
    id: string;
    name: string;
    alias?: string;
    aliasIds?: string[];
    category: string;
    description?: string;
    platforms: string[];
    provider?: 'ibm' | 'k8s';
    tags?: string[];
    displayName?: string;
    ibmCatalogId?: string;
    fsReady?: string;
    documentation?: string;
    versions: string[];
    bomModule?: BillOfMaterialModule;
}

export interface Service extends ModuleSummary {
    category: string;
    categoryName?: string;
    service_id?: string;
    fullname?: string;
    ibm_catalog_id?: string;
    fs_validated?: boolean;
    status?: string;
    controls?: Controls[];
}

export interface CatalogId {
    name: string;
    id: string;
}

/**
 * @param versions List of versions
 * @returns true if module is in 'Pending' status
 * (i.e. no versions, or latest is v0.0.0), false otherwise
 */
const isPending = (versions: string[] = []): boolean => {
    return versions.length === 0 || (versions.length === 1 && versions[0] === 'v0.0.0')
}
/**
 * @param versions List of versions
 * @returns true if module, based of versions, is in 'Beta'status
 * (i.e. no versions, or latest is v0.0.0), false otherwise
 */
const isBeta = (versions: string[] = []): boolean => {
    return first(versions.map(semanticVersionFromString).sort(semanticVersionDescending)).filter(ver => ver.major === 0).isPresent()
}

/**
 * @param modules list of ModuleSummary
 * @returns Array of unique modules, based of key 'name'
 */
const unique = (modules: ModuleSummary[]) => {
    return modules.filter((m, ix) => modules.findIndex(m2 => m2.name === m.name) === ix);
}

/**
 * @param catalog Automation Catalog
 * @returns List of Services from catalog
 */
const servicesFromCatalog = (catalog: Catalog) => {
    const cats: CatExt[] = catalog.categories;
    const services: Service[] = [];
    for (const cat of cats) {
        if (cat.modules) for (const m of cat.modules) {
            const versions = m.versions?.map(v => v.version);
            const mSummary: ModuleSummary = {
                ...m,
                versions: m.versions.map(v => v.version)
            }
            services.push({
                ...mSummary,
                status: isPending(versions) ? 'pending' : isBeta(versions) ? 'beta' : 'released',
                category: cat.category,
                categoryName: cat.categoryName
            });
        }
    }
    return unique(services);
}

export class ServicesHelper {
    @Inject loader!: CatalogLoader;
    @Inject moduleSelector!: ModuleSelector;
    @Inject catalogBuilder!: CatalogBuilder;
    client: WrappedNodeRedisClient;
    catalog: Catalog;

    constructor() {
        if (process.env.NODE_ENV !== "test") this.client = createNodeRedisClient(6379, "localhost");
    }

    /**
     * Fetch catalog from catalogUrl
     * @returns Automation Catalog
     */
    private fetchCatalog(): Promise<Catalog> {
        return new Promise((resolve, reject) => {
            this.loader.loadCatalogFromUrl(catalogUrl)
                .then(catalog => {
                    console.log(`Automation Catalog fetched from ${catalogUrl}`);
                    if (this.client) {
                        this.client.set(CATALOG_KEY, catalog)
                            .finally(() => console.log(`Automation Catalog stored in cache`));
                        const timeout = new Date();
                        timeout.setHours(timeout.getHours()+2);
                        this.client.set(`${CATALOG_KEY}-timeout`, Number(timeout).toString())
                            .finally(() => console.log(`Automation Catalog timeout stored in cache`));
                    }
                    fs.writeFileSync(`${process.cwd()}/.catalog.ignore.yaml`, catalog);
                    this.catalog = new Catalog(this.loader.parseYaml(catalog));
                    return resolve(this.catalog);
                })
                .catch(err => reject(err));
        });
    }

    /**
     * Loads catalog from Redis, or fetch it from catalogUrl
     * @returns Automation Catalog
     */
    getCatalog(): Promise<Catalog> {
        return new Promise((resolve, reject) => {
            if (this.catalog) {
                resolve(this.catalog);
            } else {
                if (this.client) {
                    this.client.get(`${CATALOG_KEY}-timeout`)
                        .then(timeoutString => {
                            if (timeoutString) {
                                const timeout = new Date(Number(timeoutString));
                                if (timeout < new Date) {
                                    console.log(`Catalog cache timed out, retrieving catalog...`);
                                    resolve(this.fetchCatalog());
                                } else {
                                    this.client.get(CATALOG_KEY)
                                        .then(catalog => {
                                            if (catalog) {
                                                console.log(`Automation Catalog retrieved from cache`);
                                                this.catalog = new Catalog(this.loader.parseYaml(catalog));
                                                resolve(this.catalog);
                                            } else {
                                                resolve(this.fetchCatalog());
                                            }
                                        })
                                        .catch(err => reject(err));
                                }
                            } else {
                                resolve(this.fetchCatalog());
                            }
                        })
                        .catch(err => reject(err));
                    
                } else {
                    resolve(this.fetchCatalog());
                }
            }
        });
    }

    /**
     * Loads services from Redis, or fetch them from catalog
     * @returns List of Catalog Services
     */
    getServices(): Promise<Service[]> {
        return new Promise((resolve, reject) => {
            if (this.client) {
                this.client.get(MODULES_KEY)
                    .then(modules => {
                        if (modules) {
                            console.log(`Automation Modules retrieved from the cache`);
                            const parsedModules: ModuleSummary[] = JSON.parse(modules);
                            return resolve(parsedModules);
                        } else {
                            this.getCatalog()
                                .then(catalog => {
                                    const services = servicesFromCatalog(catalog);
                                    for (const s of services) {
                                        this.client.set(`module-${s.name}`, JSON.stringify(s))
                                            .finally(() => console.log(`Automation Module stored in cache -> ${s.name}`));
                                    }
                                    this.client.set(MODULES_KEY, JSON.stringify(services))
                                        .finally(() => resolve(services));
                                })
                                .catch(err => reject(err));
                        }
                    })
                    .catch(err => reject(err));
            } else {
                this.getCatalog()
                    .then(catalog => resolve(servicesFromCatalog(catalog)))
                    .catch(err => reject(err));
            }
        });
    }

    /**
     * Get specific service by id
     * @returns Service
     */
    getService(id: string): Promise<Service> {
        return new Promise((resolve, reject) => {
            if (this.client) {
                this.client.get(`module-${id}`)
                    .then(service => {
                        if (service) {
                            console.log(`Automation Module retrieved from the cache -> ${id}`);
                            return resolve(JSON.parse(service));
                        } else {
                            this.getServices()
                                .then(modules => {
                                    const module = modules.find(m => m.name === id);
                                    if (module) {
                                        resolve(module);
                                    } else reject(`Module ${id} not found`);
                                })
                                .catch(err => reject(err));
                        }
                    })
                    .catch(err => reject(err));
            } else {
                this.getServices()
                    .then(modules => {
                        const module = modules.find(m => m.name === id);
                        if (module) {
                            resolve(module);
                        } else reject(`Module ${id} not found`);
                    })
                    .catch(err => reject(err));
            }
        });
    }

    /**
     * Parse BOM yaml
     * @returns Arch and Boms models generated from yaml
     */
    async parseBomYaml(yamlString: string, publicArch: boolean): Promise<{ arch: Architectures, boms: Bom[] }> {
        let bom;
        try {
            bom = billOfMaterialFromYaml(yamlString);
        } catch (error) {
            throw { message: `Failed to load bom yaml`, details: error };
        }
        const yamlBom:any = yaml.load(yamlString);
        delete yamlBom.spec.modules;
        const arch: Architectures = new Architectures({
            arch_id: `${bom.metadata.name}`,
            name: `${bom.metadata.labels?.code ? `${bom.metadata.labels?.code} - `: ''}${bom.metadata.annotations?.displayName ?? bom.metadata.name}`,
            short_desc: bom.metadata.annotations?.description ?? `${bom.metadata.name} Bill of Materials.`,
            long_desc: bom.metadata.annotations?.description ?? `${bom.metadata.name} Bill of Materials.`,
            public: publicArch,
            platform: bom.metadata.labels?.platform,
            yaml: yaml.dump(yamlBom)
        });
        const bomYaml:any = yaml.load(yamlString);
        const boms: Bom[] = [];
        const bomModules: BomModule[] = bomYaml.spec.modules;
        // const catalog = await this.getCatalog();
        for (const m of bom.spec.modules) {
            if (typeof m === 'string') throw new Error('BOM modules must not be of type string.');
            const bomModule = bomModules.find(m2 => m.alias ? m2.alias === m.alias : !m2.alias && (m2.name === m.name));
            // Skip yaml var validation for now
            // try {
            //     await this.moduleSelector.validateBillOfMaterialModuleConfigYaml(catalog, m.name ?? '', yaml.dump(bomModule));
            // } catch (error) {
            //     console.log(error);
            //     throw { message: `Module ${m.name} yaml config validation failed.`, details: error };
            // }
            boms.push(new Bom({
                arch_id: arch.arch_id,
                service_id: m.name,
                desc: m.alias ?? m.name,
                yaml: yaml.dump(bomModule)
            }));
        }
        return { arch: arch, boms: boms };
    }

    /**
     * Validate BOM module yaml config
     * @returns Arch and Boms models generated from yaml
     */
    async validateBomModuleYaml(yamlString: string, moduleRef: string): Promise<void> {
        try {
            const catalog = await this.getCatalog();
            await this.moduleSelector.validateBillOfMaterialModuleConfigYaml(catalog, moduleRef, yamlString);
        } catch (error) {
            throw { message: `Module ${moduleRef} yaml config validation failed.`, details: error };
        }
    }

    async buildTerraform(architecture: Architectures, boms: Bom[], drawio?: S3.Body, png?: S3.Body): Promise<Buffer> {
        const catalog = await this.getCatalog();

        // Get the smaller Catalog data
        const catids: CatalogId[] = []
        catalog.categories.forEach(category => {
            if (category.modules) category.modules.forEach((module) => {
                catids.push({
                    name: module.name,
                    id: module.id
                });
            });
        })

        // Future : Push to Object Store, Git, Create a Tile Dynamically
        const bomYaml:any = yaml.load(architecture.yaml);
        bomYaml.spec.modules = [];

        // From the BOM build an Automation BOM
        const errors: Array<{ id: string, message: string }> = [];
        boms.forEach(bomItem => {
            // from the bom look up service with id
            const catentry = catids.find(catid => catid.name === bomItem.service_id);
            if (catentry) {
                try {
                    bomYaml.spec.modules.push(yaml.load(bomItem.yaml));
                }
                catch (e:any) {
                    // Capture Errors
                    errors.push({ id: bomItem.service_id, message: e?.message });
                }
            } else {
                console.log(`Catalog entry ${bomItem.service_id} not found`);
            }
        })

        const bom: BillOfMaterialModel = billOfMaterialFromYaml(yaml.dump(bomYaml), architecture.arch_id);

        if (errors?.length) {
            console.log(errors);
            throw { message: `Error building some of the modules.`, details: errors };
        }

        // Lets build a BOM file from the BOM builder
        const iascableResult = await this.catalogBuilder.build(`file:/${process.cwd()}/.catalog.ignore.yaml`, bom);

        // Write into a Buffer
        // creating archives
        const zip = new AdmZip();

        // Output BOM
        if (iascableResult.billOfMaterial) {
            const bomStr = yaml.dump(iascableResult.billOfMaterial);
            zip.addFile("bom.yaml", Buffer.alloc(bomStr.length, bomStr), "BOM yaml content");
        }

        // Output Terraform Components
        await Promise.all(iascableResult.terraformComponent.files.map(async (file: OutputFile) => {
            function getContents(url: string) {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
                return new Promise<string>(async (resolve) => {
                    const req: Superagent.Response = await Superagent.get(url);

                    resolve(req.text);
                })
            };
            let contents: string | Buffer = "";
            //console.log(file.name);
            if (file.name.endsWith('.tfvars')) file.name = `terraform/${file.name.replace('terraform', `${bom.metadata.name}.auto`)}`;
            if (file.name.endsWith('.tf')) file.name = `terraform/${file.name}`;
            if (file.type === "documentation") {
                try {
                    contents = await getContents((file as any).url);
                } catch (e) {
                    console.log("failed to load contents from ", file.name);
                }
            } else {
                try {
                    contents = (await file.contents).toString();
                } catch (e) {
                    console.log("failed to load contents from ", file.name);
                }
            }
            // Load Contents into the Zip
            if (contents !== "") {
                zip.addFile(file.name, Buffer.alloc(contents.length, contents), "entry comment goes here");
            }
        }));

        // Output Tile
        if (iascableResult.tile) {
            const tileContent = await iascableResult.tile.file.contents;
            zip.addFile(iascableResult.tile.file.name, typeof tileContent === 'string' ? Buffer.alloc(tileContent.length, tileContent) : tileContent, "Tile content");
        }

        // Output Dependency Graph
        if (iascableResult.graph) {
            const graphContent = await iascableResult.graph.contents;
            zip.addFile(iascableResult.graph.name, typeof graphContent === 'string' ? Buffer.alloc(graphContent.length, graphContent) : graphContent, "Dependency graph");
        }

        // TODO: Output Apply script
        zip.addLocalFile(`${process.cwd()}/node_modules/@cloudnativetoolkit/iascable/scripts/apply.sh`, 'scripts');
        // TODO: Output Destroy script
        zip.addLocalFile(`${process.cwd()}/node_modules/@cloudnativetoolkit/iascable/scripts/destroy.sh`, 'scripts');
        // TODO: Output Launch script
        zip.addLocalFile(`${process.cwd()}/node_modules/@cloudnativetoolkit/iascable/scripts/launch.sh`, 'scripts');
        
        // Add the Diagrams to the Zip Contents
        // Add the Diagrams from the Architectures
        if (architecture.arch_id) {
            if (drawio) zip.addFile(`${architecture.arch_id}.drawio`, Buffer.alloc(drawio.toString().length, drawio.toString()), `Architecture diagram ${architecture.arch_id} .drawio file`);
            if (png) {
                fs.writeFileSync(`/tmp/${architecture.arch_id}.png`, png);
                zip.addLocalFile(`/tmp/${architecture.arch_id}.png`);
            }
        }

        return zip.toBuffer()
    }

    /**
     * Enrich BOM yaml
     * @returns JSON object with BOM and enriched data for modules
     */
    async enrichBomYaml(yamlString: string): Promise<object> {
        const catalog = await this.getCatalog();
        let enrichedBom:any;
        try {
            const bom = billOfMaterialFromYaml(yamlString);
            enrichedBom = bom;
            for (const ix in bom.spec.modules) {
                let moduleMetadata;
                const m = bom.spec.modules[ix];
                switch (typeof m) {
                    case 'string':
                        moduleMetadata = catalog.modules?.find(m2 => m2.name === m);
                        break;
                    default:
                        moduleMetadata = catalog.modules?.find(m2 => m2.name === m.name);
                        break;
                }
                enrichedBom.spec.modules[ix].enrichedMetadata = moduleMetadata?.versions[0];
            }
        } catch (error) {
            throw { message: `Failed to load bom yaml`, details: error };
        }
        return { bom: enrichedBom };
    }
}