import {Entity, model, property, hasMany} from '@loopback/repository';
import {
  Architectures,
  SolutionArchitectures,
  User,
  UserSolutions
} from '../models/';

/* eslint-disable @typescript-eslint/naming-convention */

@model()
export class Solution extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    required: true,
  })
  id: string;

  @property({
    type: 'string',
    required: true,
  })
  name: string;

  @property({
    type: 'string',
  })
  platform?: string;

  @property({
    type: 'string',
  })
  short_desc?: string;

  @property({
    type: 'string',
  })
  long_desc?: string;

  @property({
    type: 'boolean',
  })
  public?: boolean;

  @property({
    type: 'boolean',
  })
  techzone?: boolean;

  @hasMany(() => Architectures, {
    through: {
      model: () => SolutionArchitectures,
      keyFrom: 'solution_id',
      keyTo: 'arch_id'
    }
  })
  architectures: Architectures[];

  @property({
    type: 'string',
  })
  yaml: string;

  @hasMany(() => User, {
    through: {
      model: () => UserSolutions,
      keyFrom: 'solution_id',
      keyTo: 'email'
    }
  })
  owners: User[];

  constructor(data?: Partial<Solution>) {
    super(data);
  }
}

export interface SolutionRelations {
  // describe navigational properties here
}

export type SolutionWithRelations = Solution & SolutionRelations;
