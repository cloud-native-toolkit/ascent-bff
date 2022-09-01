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
    'ArchitecturesBomController.prototype.syncRefArchs',
    'OnBoardingStageController.prototype.create',
    'OnBoardingStageController.prototype.updateAll',
    'OnBoardingStageController.prototype.updateById',
    'OnBoardingStageController.prototype.replaceById',
    'OnBoardingStageController.prototype.deleteById',
    'ControlsController.prototype.importControls',
    'ArchitecturesBomController.prototype.uploadBomYaml',
  ]

  const publicResourceTargets = [
    'ArchitecturesController.prototype.create',
    'ArchitecturesController.prototype.updateAll',
    'ArchitecturesController.prototype.updateById',
    'SolutionController.prototype.create',
    'SolutionController.prototype.updateById',
  ]
  const publicResourceQueryTargets = [
    'ArchitecturesBomController.prototype.uploadBomYaml',
  ]
  
  /**
   * Interceptor checking that user has ownership over resources he's trying to
   * access.
   */
  @injectable(asGlobalInterceptor('admin'))
  export class AdminInterceptor implements Provider<Interceptor> {
  
    value() {
      return async (
        ctx: InvocationContext,
        next: () => ValueOrPromise<InvocationResult>,
      ) => {
        console.log("admin interceptor")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const request:any = await ctx.get(RestBindings.Http.REQUEST);
        const response = await ctx.get(RestBindings.Http.RESPONSE);
    
        if (!['dev', 'test'].includes(process.env.NODE_ENV || '') && (
          protectedTargets.includes(ctx.targetName) && !request?.scopes?.includes("super_edit") || 
          publicResourceTargets.includes(ctx.targetName) && request?.body?.public && !request?.scopes?.includes("super_edit") ||
          publicResourceQueryTargets.includes(ctx.targetName) && request?.query?.public === 'true' && !request?.scopes?.includes("super_edit")
        )) {
          return response.status(401).send({error: {
            message: `Must have administrator privilege to perform this request.`
          }});
        }
  
        const result = await next();
        return result;
      };
    }
  }
  