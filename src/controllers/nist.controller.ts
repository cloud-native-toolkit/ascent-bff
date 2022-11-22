import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  param,
  get,
  getModelSchemaRef,
  response,
  post,
  requestBody,
} from '@loopback/rest';
import {Nist} from '../models';
import {NistRepository} from '../repositories';

export class NistController {
  constructor(
    @repository(NistRepository)
    public nistRepository : NistRepository,
  ) {}

  @get('/nist/count')
  @response(200, {
    description: 'Nist model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(Nist) where?: Where<Nist>,
  ): Promise<Count> {
    return this.nistRepository.count(where);
  }

  @get('/nist')
  @response(200, {
    description: 'Array of Nist model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Nist, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(Nist) filter?: Filter<Nist>,
  ): Promise<Nist[]> {
    return this.nistRepository.find(filter);
  }

  @post('/nist')
  @response(200, {
    description: 'Nist model instance',
    content: {'application/json': {schema: getModelSchemaRef(Nist)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Nist, {
            title: 'NewNist'
          }),
        },
      },
    })
    nist: Nist,
  ): Promise<Nist> {
    return this.nistRepository.create(nist);
  }

  @get('/nist/{id}')
  @response(200, {
    description: 'Nist model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Nist, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Nist, {exclude: 'where'}) filter?: FilterExcludingWhere<Nist>
  ): Promise<Nist> {
    return this.nistRepository.findById(id, filter);
  }
}
