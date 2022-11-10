import {ApplicationConfig} from '@loopback/core';
import {once} from 'events';
import express from 'express';
import http from 'http';
import {AddressInfo} from 'net';
import * as path from 'path';
import {AscentBffApplication} from './application';

export {ApplicationConfig};

/**
 * An express server with multiple apps
 *
 *  1. WEB App:  An express app which protects routes using AppId
 *  2. LB4 API server
 */
export class ExpressServer {
  public expressServer: express.Application;
  public readonly lbApp: AscentBffApplication;
  private server?: http.Server;
  public url: String;

  constructor(options: ApplicationConfig = {}) {
    // Express Web App
    this.expressServer = require('../express-app/express-server');
    // LB4 App
    this.lbApp = new AscentBffApplication(options);

    // Serve static files in the public folder
    this.expressServer.use(express.static(path.join(__dirname, '../public')));

    /**
     * Mount the LB4 app router in / path
     */
    this.expressServer.use('/', this.lbApp.requestHandler);
  }

  public async boot() {
    await this.lbApp.boot();
  }

  /**
   * Start the express app and the lb4 app
   */
  public async start() {
    await this.lbApp.start();
    const port = this.lbApp.restServer.config.port ?? 3001;
    const host = this.lbApp.restServer.config.host ?? 'localhost';
    this.server = this.expressServer.listen(port, host);
    await once(this.server, 'listening');
    const add = <AddressInfo>this.server.address();
    this.url = `http://${add.address}:${add.port}`;
  }

  /**
   * Stop lb4 and express apps
   */
  public async stop() {
    if (!this.server) return;
    await this.lbApp.stop();
    this.server.close();
    await once(this.server, 'close');
    this.server = undefined;
  }
}
