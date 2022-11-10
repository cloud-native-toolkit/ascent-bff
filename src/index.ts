import {RestApplication} from '@loopback/rest';
import {ApplicationConfig, ExpressServer} from './server';

export * from './application';
export * from './server';

/**
 * Prepare server config
 */
export async function serverConfig(): Promise<ApplicationConfig> {
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3001),
      host: process.env.HOST,
      // protocol: 'http',
      gracePeriodForClose: 5000, // 5 seconds
      openApiSpec: {
        setServersFromRequest: true,
      },
      // Use the LB4 application as a route. It should not be listening.
      listenOnStart: false,
    }
  };
  return config;
}

/**
 * bind resources to application
 * @param server
 */
export async function setupApplication(
  lbApp: RestApplication
) {
  lbApp.bind('datasources.config.db').to({
    name: 'db',
    connector: 'memory',
    localStorage: '',
    file: undefined,
  });
}

/**
 * Start this application
 */
export async function startApplication(): Promise<ExpressServer> {
  const config = await serverConfig();
  const server = new ExpressServer(config);
  await setupApplication(server.lbApp);
  await server.boot();
  await server.start();
  return server;
}

/**
 * run main() to start application with oauth config
 */
export async function main() {
  const server: ExpressServer = await startApplication();
  console.log(`Server is running at ${server.url}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
