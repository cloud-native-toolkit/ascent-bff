import { hasMany, Entity, model, property } from '@loopback/repository';
import { Controls, ControlMapping } from '.';

/* eslint-disable @typescript-eslint/naming-convention */

@model({ settings: { strict: false } })
export class Services extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    required: true,
  })
  service_id: string;

  @property({
    type: 'string',
    required: true,
  })
  grouping: string;

  @property({
    type: 'string',
    required: true,
  })
  ibm_service: string;

  @property({
    type: 'string',
  })
  desc?: string;

  @property({
    type: 'string',
    required: true,
  })
  deployment_method: string;

  @property({
    type: 'boolean',
    required: true,
  })
  fs_ready: boolean;

  @property({
    type: 'string',
  })
  quarter?: string;

  @property({
    type: 'date',
  })
  date?: string;

  @property({
    type: 'string',
    required: true,
  })
  provision: string;

  @property({
    type: 'string',
  })
  cloud_automation_id?: string;

  @property({
    type: 'string',
  })
  hybrid_automation_id?: string;

  @property({
    type: 'string',
  })
  _id?: string;
  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  @hasMany(() => Controls, {
    through: {
      model: () => ControlMapping,
      keyFrom: 'resource',
      keyTo: 'control',
    }
  })
  services: Controls[];

  constructor(data?: Partial<Services>) {
    super(data);
  }
}