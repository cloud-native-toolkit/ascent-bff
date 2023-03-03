import { Inject } from 'typescript-ioc';

import fs from "fs";

import {
    billOfMaterialFromYaml, isBillOfMaterialModel,
    BillOfMaterialModule, BillOfMaterialEntry,
    Catalog, CatalogCategoryModel, CatalogLoader, ModuleSelector,
    CatalogBuilder, BundleWriterType, getBundleWriter, CustomResourceDefinition, SolutionModel
} from '@cloudnativetoolkit/iascable';

import {
    createNodeRedisClient,
    WrappedNodeRedisClient
} from 'handy-redis';

import yaml from 'js-yaml';
import { S3 } from 'ibm-cos-sdk';

import { semanticVersionDescending, semanticVersionFromString } from '../util/semantic-version';
import { Architectures, Bom, Controls, Solution } from '../models';
import catalogConfig from '../config/automation-catalog.config'
import first from '../util/first';
import axios from 'axios';
import { uniq } from 'lodash';

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-throw-literal */

const MODULES_KEY = 'automation-modules';
const CATALOG_TIMEOUT_HOURS = 2;

const loadCatalogUrls = (boms: CustomResourceDefinition[], inputUrls: string[]): string[] => {
    return boms
        .map(extractCatalogUrlsFromBom)
        .reduce((previous: string[], current: string[]) => {
            const result = previous.concat(current)

            return uniq(result)
        }, inputUrls)
}
const extractCatalogUrlsFromBom = (bom: CustomResourceDefinition): string[] => {
    const annotations: any = bom.metadata?.annotations || {}

    const catalogUrls: string[] = Object.keys(annotations)
        .filter(key => /^catalog[Uu]rl.*/.test(key))
        .reduce((result: string[], key: string) => {
            if (/^catalog[Uu]rl$/.test(key)) {
                const urls = annotations[key].split(',').filter((val: string) => !!val)

                result.push(...urls)
            } else if (annotations[key]) {
                result.push(annotations[key])
            }

            return result
        }, [])

    return catalogUrls
}

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
    const services: Service[] = [];
    for (const m of catalog.modules) {
        const versions = m.versions?.map(v => v.version);
        const mSummary: ModuleSummary = {
            ...m,
            versions: m.versions.map(v => v.version)
        }
        services.push({
            ...mSummary,
            status: isPending(versions) ? 'pending' : isBeta(versions) ? 'beta' : 'released'
        });
    }
    return unique(services);
}

export class IascableService {
    @Inject catalogLoader!: CatalogLoader;
    @Inject moduleSelector!: ModuleSelector;
    @Inject catalogBuilder!: CatalogBuilder;
    client: WrappedNodeRedisClient;
    catalog: Catalog;

    constructor() {
        if (process.env.NODE_ENV !== "test") this.client = createNodeRedisClient(process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379, process.env.REDIS_HOST ?? "localhost");
    }

    /**
     * Fetch catalog from catalogUrl
     * @returns Automation Catalog
     */
    private fetchCatalog(): Promise<Catalog> {
        return new Promise((resolve, reject) => {
            this.catalogLoader.loadCatalog(catalogConfig.catalogUrls)
                .then(catalog => {
                    console.log(`Automation Catalog fetched from ${catalogConfig.catalogUrls.join(', ')}`);
                    if (this.client) {
                        this.client.set('automation-catalog', JSON.stringify(catalog))
                            .finally(() => console.log(`Automation Catalog stored in cache`));
                        const timeout = new Date();
                        timeout.setHours(timeout.getHours() + CATALOG_TIMEOUT_HOURS);
                        this.client.set(`automation-catalog-timeout`, Number(timeout).toString())
                            .finally(() => console.log(`Automation Catalog timeout stored in cache: ${timeout}`));
                    }
                    fs.writeFileSync(`${process.cwd()}/.automation-catalog.ignore.yaml`, JSON.stringify(catalog));
                    this.catalog = new Catalog(catalog);
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
                    this.client.get(`automation-catalog-timeout`)
                        .then(timeoutString => {
                            if (timeoutString) {
                                const timeout = new Date(Number(timeoutString));
                                if (timeout < new Date()) {
                                    console.log(`Catalog cache timed out ${timeout}, retrieving catalog...`);
                                    resolve(this.fetchCatalog());
                                } else {
                                    this.client.get('automation-catalog')
                                        .then(catalog => {
                                            if (catalog) {
                                                console.log(`Automation Catalog retrieved from cache`);
                                                resolve(this.catalogLoader.loadCatalog(`file:/${process.cwd()}/.automation-catalog.ignore.yaml`));
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
     * Loads Bom catalog from Redis, or fetch them from catalog URL
     * @returns YAML boms catalog
     */
    getBomsCatalog(): Promise<Catalog> {
        return new Promise((resolve, reject) => {
            this.getCatalog()
                .then(catalog => resolve(catalog))
                .catch(err => reject(err));
        });
    }

    /**
     * Loads boms from Redis, or fetch them from catalog
     * @returns List of Catalog BOMs
     */
    getBoms(): Promise<BillOfMaterialEntry[]> {
        return new Promise((resolve, reject) => {
            this.getCatalog()
                .then(catalog => resolve(catalog.boms))
                .catch(err => reject(err));
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
        if (isBillOfMaterialModel(bom)) {
            const yamlBom: any = yaml.load(yamlString);
            delete yamlBom.spec.modules;
            const arch: Architectures = new Architectures({
                arch_id: `${bom.metadata?.name}`,
                name: `${bom.metadata?.labels?.code ? `${bom.metadata?.labels?.code} - ` : ''}${bom.metadata?.annotations?.displayName ?? bom.metadata?.name}`,
                short_desc: bom.metadata?.annotations?.description ?? `${bom.metadata?.name} Bill of Materials.`,
                long_desc: bom.metadata?.annotations?.description ?? `${bom.metadata?.name} Bill of Materials.`,
                public: publicArch,
                platform: bom.metadata?.labels?.platform,
                yaml: yaml.dump(yamlBom)
            });
            const bomYaml: any = yaml.load(yamlString);
            const boms: Bom[] = [];
            const bomModules: BomModule[] = bomYaml.spec.modules;
            // const catalog = await this.getCatalog();
            for (const m of bom.spec.modules) {
                if (typeof m === 'string') throw new Error('BOM modules must not be of type string.');
                const bomModule = bomModules.find(m2 => m.alias ? m2.alias === m.alias : !m2.alias && (m2.name === m.name));
                boms.push(new Bom({
                    arch_id: arch.arch_id,
                    service_id: m.name,
                    desc: m.alias ?? m.name,
                    yaml: yaml.dump(bomModule)
                }));
            }
            return { arch: arch, boms: boms };
        } else throw { message: `Must be a bom yaml, not a solution.` };
    }

    /**
     * Parse Solution yaml
     * @returns Solution models generated from yaml
     */
    async parseSolutionYaml(yamlString: string, publicSol: boolean): Promise<Solution> {
        let sol;
        try {
            sol = billOfMaterialFromYaml(yamlString);
        } catch (error) {
            throw { message: `Failed to load solution yaml`, details: error };
        }
        if (!isBillOfMaterialModel(sol)) {
            const solYaml: any = yaml.load(yamlString);
            delete solYaml.spec.stack;
            const newSol: Solution = new Solution({
                id: solYaml.metadata?.name,
                name: `${solYaml.metadata?.annotations?.displayName ?? solYaml.metadata?.name}`,
                short_desc: solYaml.metadata?.annotations?.description ?? `${solYaml.metadata?.annotations?.displayName ?? solYaml.metadata?.name} Solution.`,
                long_desc: solYaml.metadata?.annotations?.description ?? `${solYaml.metadata?.annotations?.displayName ?? solYaml.metadata?.name} Solution.`,
                public: publicSol,
                techzone: false,
                platform: solYaml.metadata?.labels?.platform,
                yaml: yaml.dump(solYaml)
            });
            return newSol;
        } else throw { message: `Must be a solution yaml, not a bom.` };
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
        //const catalog = await this.getCatalog();

        // Future : Push to Object Store, Git, Create a Tile Dynamically
        const bomYaml: any = yaml.load(architecture.yaml);
        bomYaml.spec.modules = [];

        // From the BOM build an Automation BOM
        const errors: Array<{ id: string, message: string }> = [];
        boms.forEach(bomItem => {
            bomYaml.spec.modules.push(yaml.load(bomItem.yaml));
        });

        const bom = billOfMaterialFromYaml(yaml.dump(bomYaml), architecture.arch_id);
        const catalogUrls: string[] = loadCatalogUrls([bom], catalogConfig.catalogUrls);
        const cat: Catalog = await this.catalogLoader.loadCatalog(catalogUrls);

        if (errors?.length) {
            console.log(errors);
            throw { message: `Error building some of the modules.`, details: errors };
        }

        // Lets build a BOM file from the BOM builder

        const iascableBundle = await this.catalogBuilder.buildBomsFromCatalog(cat, [bom]);
        const options = { flatten: false, basePath: process.cwd() };
        await iascableBundle.writeBundle(getBundleWriter(BundleWriterType.zip), options).generate('.result.ignore.zip');

        return fs.readFileSync(`${process.cwd()}/.result.ignore.zip`);
    }

    async buildSolution(solution: Solution) {
        let sol: SolutionModel;
        try {
            if (solution.yaml) {
                sol = yaml.load(solution.yaml);
                sol.spec.stack = [];
            }
            else throw new Error("Solution yaml not found");
        } catch (error) {
            sol = {
                apiVersion: 'cloudnativetoolkit.dev/v2',
                kind: 'Solution',
                metadata: {
                    name: solution.name,
                    annotations: {
                        displayName: solution.short_desc,
                        description: solution.long_desc
                    }
                },
                spec: {
                    stack: [],
                    version: 'v1.0.0',
                    variables: [],
                    files: []
                }
            };
        }
        for (const arch of solution.architectures) {
            sol.spec.stack.push({
                name: arch.arch_id,
                layer: yaml.load(arch.yaml)?.metadata?.labels?.type ?? 'infrastructure',
                description: arch.long_desc ?? arch.short_desc
            });
        }
        const catalogUrls: string[] = loadCatalogUrls([sol], catalogConfig.catalogUrls);
        const cat: Catalog = await this.catalogLoader.loadCatalog(catalogUrls);
        const iascableBundle = await this.catalogBuilder.buildBomsFromCatalog(cat, [sol]);
        const bundleWriter = iascableBundle.writeBundle(
            getBundleWriter(BundleWriterType.zip),
            { flatten: false, basePath: process.cwd() }
        );
        await bundleWriter.generate('.result.ignore.zip');
        return fs.readFileSync(`${process.cwd()}/.result.ignore.zip`);
    }

    /**
     * Get solution boms
     * @returns BOMs that consistute given solution
     */
    async solutionBoms(solutionId: string): Promise<string[]> {
        try {
            const catalog = await this.getCatalog();
            const catEntry = catalog.boms.find(entry => entry.name === solutionId && entry.type === 'solution');
            let boms: string[] = [];
            if (catEntry?.versions[0].metadataUrl) {
                const yamlString = await (await axios.get(catEntry?.versions[0].metadataUrl)).data;
                const obj = yaml.load(yamlString);
                const stack: { name: string }[] = obj?.spec?.stack;
                for (const stackItem of stack) {
                    const stackItemCatEntry = catalog.boms.find(entry => entry.name === stackItem.name);
                    if (stackItemCatEntry?.type === 'solution') boms = [...boms, ...(await this.solutionBoms(stackItem.name))];
                    else boms = [...boms, stackItem.name];
                }
            }
            return boms;
        } catch (error) {
            throw { message: `Error fetching solution ${solutionId} boms`, details: error };
        }
    }
}
