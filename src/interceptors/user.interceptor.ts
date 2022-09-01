import {
    asGlobalInterceptor,
    injectable,
    Interceptor,
    InvocationContext,
    InvocationResult,
    Provider,
    ValueOrPromise,
  } from '@loopback/core';
  import { RestBindings } from '@loopback/rest';
  
  // List of protected resources
  const protectedTargets = [
    'UserController.prototype.getById',
    'UserController.prototype.findUserArchitecturesById',
    'UserController.prototype.findUserSolutionsById',
    'UserController.prototype.updateById',
  ]
  
  /**
   * Interceptor checking that user has ownership over resources he's trying to
   * access.
   */
  @injectable(asGlobalInterceptor('user'))
  export class UserInterceptor implements Provider<Interceptor> {
  
    value() {
      return async (
        ctx: InvocationContext,
        next: () => ValueOrPromise<InvocationResult>,
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const request:any = await ctx.get(RestBindings.Http.REQUEST);
        const response = await ctx.get(RestBindings.Http.RESPONSE);
  
        const email:string = request?.user?.email;
    
        if (!['dev', 'test'].includes(process.env.NODE_ENV || '') && protectedTargets.includes(ctx.targetName) && email !== ctx.args[0]) {
            return response.status(401).send({error: {
              message: `You don't have permission to perform this request.`
            }});
        }
  
        const result = await next();
        return result;
      };
    }
  }
  