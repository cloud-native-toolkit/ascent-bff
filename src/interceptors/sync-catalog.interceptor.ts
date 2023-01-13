import {
    asGlobalInterceptor,
    inject,
    injectable,
    Interceptor,
    InvocationContext,
    InvocationResult,
    Provider,
    ValueOrPromise,
} from '@loopback/core';

import { repository } from '@loopback/repository';
import { SolutionController, ArchitecturesBomController } from '../controllers';
import { createNodeRedisClient, WrappedNodeRedisClient } from 'handy-redis';
import { Inject } from 'typescript-ioc';
import {
    ArchitecturesRepository,
    AutomationReleaseRepository,
    BomRepository,
    ControlDetailsRepository,
    ControlMappingRepository,
    ServicesRepository,
    SolutionRepository,
    UserRepository
} from '../repositories';
import { IascableService } from '../services/iascable.service';
import { FileUploadHandler } from '../types';
import { FILE_UPLOAD_SERVICE } from '../keys';

const SYNC_CATALOG_KEY = 'automation-catalog-sync-ts';
const SYNC_CATALOG_HOURS = 1;

const TARGET_CONTROLLERS = [
    'SolutionController', 'ArchitecturesBomController',
    'ArchitecturesController', 'AutomationCatalogController',
    'BomController', 'SolutionController'
]


/**
 * Interceptor making sure public BOMs/Sols are on sync with Catalog.
 */
@injectable(asGlobalInterceptor('sync-catalog'))
export class SolutionOwnershipInterceptor implements Provider<Interceptor> {

    @Inject iascableService!: IascableService;
    client: WrappedNodeRedisClient;
    private solutionController: SolutionController;
    private bomsController: ArchitecturesBomController;

    constructor(
        @repository(SolutionRepository) protected solutionRepository: SolutionRepository,
        @repository(UserRepository) protected userRepository: UserRepository,
        @repository(ArchitecturesRepository) protected architecturesRepository: ArchitecturesRepository,
        @repository(ServicesRepository) protected servicesRepository: ServicesRepository,
        @repository(BomRepository) protected bomRepository: BomRepository,
        @repository(ControlMappingRepository) protected cmRepository: ControlMappingRepository,
        @repository(AutomationReleaseRepository) protected automationReleaseRepository: AutomationReleaseRepository,
        @repository(ControlDetailsRepository) protected controlDetailsRepository: ControlDetailsRepository,
        @inject(FILE_UPLOAD_SERVICE) private fileHandler: FileUploadHandler,
    ) {
        this.solutionController = new SolutionController(this.solutionRepository, this.userRepository, this.architecturesRepository, this.servicesRepository, this.fileHandler);
        this.bomsController = new ArchitecturesBomController(this.architecturesRepository, this.bomRepository, this.cmRepository, this.servicesRepository, this.userRepository, this.automationReleaseRepository, this.controlDetailsRepository, this.fileHandler);
        if (process.env.NODE_ENV !== "test") this.client = createNodeRedisClient(process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379, process.env.REDIS_HOST ?? "localhost");
    }

    setTimeOut() {
        const ts = new Date();
        ts.setHours(ts.getHours() + SYNC_CATALOG_HOURS);
        this.client.set(SYNC_CATALOG_KEY, Number(ts).toString())
            .finally(() => console.log(`Sync Catalog timestamp stored in cache: ${ts}`));
    }

    value() {
        return async (
            ctx: InvocationContext,
            next: () => ValueOrPromise<InvocationResult>,
        ) => {

            if (!['dev', 'test'].includes(process.env.NODE_ENV || '')) {
                if (TARGET_CONTROLLERS.find(c => ctx.targetName.startsWith(c))) {
                    this.client.get(SYNC_CATALOG_KEY)
                        .then(timestamp => {
                            if (timestamp) {
                                const timeout = new Date(Number(timestamp));
                                if (timeout < new Date()) {
                                    console.log(`Synchronizing public solutions and boms...`);
                                    this.solutionController.syncSolutions().then(() => console.log('OK -> Public solutions synchronized')).catch(console.error);
                                    this.bomsController.syncRefArchs().then(() => console.log('OK -> Public BOMs synchronized')).catch(console.error);
                                    this.setTimeOut();
                                }
                            } else {
                                console.log(`Synchronizing public solutions and boms...`);
                                this.solutionController.syncSolutions().then(() => console.log('OK -> Public solutions synchronized')).catch(console.error);
                                this.bomsController.syncRefArchs().then(() => console.log('OK -> Public BOMs synchronized')).catch(console.error);
                                this.setTimeOut();
                            }
                        })
                        .catch(console.error);
                }
            }
            const result = await next();
            return result;
        };
    }
}
