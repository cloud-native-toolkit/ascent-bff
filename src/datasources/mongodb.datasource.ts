import { inject, lifeCycleObserver, LifeCycleObserver } from '@loopback/core';
import { juggler } from '@loopback/repository';

import assert from 'assert';
import * as _ from 'lodash';
import { Services } from '../appenv';

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class MongodbDataSource extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'mongodb';

  constructor(
    @inject('mongodb', { optional: true })
    dsConfig: object,
  ) {

    const services = Services.getInstance();

    // The services object is a map named by service so we extract the one for MongoDB
    /* eslint-disable @typescript-eslint/no-explicit-any*/
    const mongodbServices: any = services.getService('database');

    // This check ensures there is a services for MongoDB databases
    assert(!_.isUndefined(mongodbServices), 'backend must be bound to mongodb service');

    // We now take the first bound MongoDB service and extract it's credentials object
    const mongodbConn = mongodbServices.connection.mongodb;
    const mongodbComposed = mongodbConn.composed[0];

    // Extract the database username and password
    const authentication = mongodbConn.authentication;
    const username: string = authentication.username;
    const password: string = authentication.password;

    // Extract the MongoDB URIs
    const connectionPath = mongodbConn.hosts;

    // tslint:disable-next-line:max-line-length
    //const connectionString = `mongodb://${username}:${password}@${connectionPath[0].hostname}:${connectionPath[0].port},${connectionPath[1].hostname}:${connectionPath[1].port}/?replicaSet=replset`;

    const config = {
      name: 'mongodb',
      debug: true,
      connector: 'mongodb',
      url: mongodbComposed,
      user: username,
      password: password,
      host: connectionPath[0].hostname,
      database: mongodbConn.database,
      authSource: mongodbConn?.query_options?.authSource,
      useNewUrlParser: true,
      ssl: mongodbConn?.query_options?.tls,
      sslValidate: mongodbConn?.certificate?.certificate_base64 ? true : false,
      checkServerIdentity: false,
      sslCA: mongodbConn?.certificate?.certificate_base64 ? [Buffer.from(mongodbConn?.certificate?.certificate_base64, 'base64')] : [],
    };

    super(config ?? dsConfig);

    // Check if indexes exist if not create them
  }
}
