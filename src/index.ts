import {
  GraphQLFieldConfig,
  GraphQLFieldConfigMap,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLSchema,
} from 'graphql';
import refParser, { JSONSchema } from 'json-schema-ref-parser';
import {
  addTitlesToJsonSchemas,
  Endpoint,
  Endpoints,
  getAllEndPoints,
  GraphQLParameters,
  SwaggerSchema,
} from './swagger';
import {
  GraphQLOutputTypeMap,
  jsonSchemaTypeToOutputGraphQL,
  mapParametersToInputFields,
} from './typeMap';
import { RequestOptions } from './getRequestOptions';
import { RootGraphQLSchema } from './json-schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseResponse(response: any, returnType: GraphQLOutputType) {
  
  const nullableType =
    returnType instanceof GraphQLNonNull ? returnType.ofType : returnType;
  if (
    nullableType instanceof GraphQLObjectType ||
    nullableType instanceof GraphQLList
  ) {
    return response;
  }

  if (nullableType.name === 'String' && typeof response !== 'string') {
    return JSON.stringify(response);
  }
  return response;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getFields = <TContext>(
  endpoints: Endpoints,
  isMutation: boolean,
  gqlTypes: GraphQLOutputTypeMap,
  { callBackend }: Options<TContext>,
): GraphQLFieldConfigMap<any, any> => {
  const intpuGqlType = {};
  return Object.keys(endpoints)
    .filter((operationId: string) => {
      return !!endpoints[operationId].mutation === !!isMutation;
    })
    .reduce((result, operationId) => {
      const endpoint: Endpoint = endpoints[operationId];
      const type = jsonSchemaTypeToOutputGraphQL(
        operationId,
        endpoint.response || { type: 'object', properties: {} },
        'response',
        gqlTypes,
        true,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gType: GraphQLFieldConfig<any, any> = {
        type,
        description: endpoint.description,
        args: mapParametersToInputFields(endpoint.parameters, operationId, intpuGqlType),
        resolve: async (
          _source: any,
          args: GraphQLParameters,
          context: TContext,
          info: GraphQLResolveInfo,
        ): Promise<any> => {
          return parseResponse(
            await callBackend({
              context,
              requestOptions: endpoint.getRequestOptions(args),
            }),
            info.returnType,
          );
        },
      };
      return { ...result, [operationId]: gType };
    }, {});
};

const schemaFromEndpoints = <TContext>(
  endpoints: Endpoints,
  options: Options<TContext>,
): GraphQLSchema => {
  const gqlTypes = {};
  const queryFields = getFields(endpoints, false, gqlTypes, options);
  // if (!Object.keys(queryFields).length) {
  //   throw new Error('Did not find any GET endpoints');
  // }
  const rootType = new GraphQLObjectType({
    name: 'Query',
    fields: queryFields,
  });

  const graphQLSchema: RootGraphQLSchema = {
    query: rootType,
  };

  const mutationFields = getFields(endpoints, true, gqlTypes, options);
  if (Object.keys(mutationFields).length) {
    graphQLSchema.mutation = new GraphQLObjectType({
      name: 'Mutation',
      fields: mutationFields,
    });
  }

  return new GraphQLSchema(graphQLSchema);
};

export { RequestOptions, JSONSchema };

export interface CallBackendArguments<TContext> {
  context: TContext;
  requestOptions: RequestOptions;
}

export interface Options<TContext> {
  swaggerSchema: string | JSONSchema;
  callBackend: (args: CallBackendArguments<TContext>) => Promise<any>;
}

export const createSchema = async <TContext>(
  options: Options<TContext>,
): Promise<GraphQLSchema> => {
  const schemaWithoutReferences = (await refParser.dereference(
    options.swaggerSchema,
  )) as SwaggerSchema;
  const swaggerSchema = addTitlesToJsonSchemas(schemaWithoutReferences);
  const endpoints = getAllEndPoints(swaggerSchema);
  return schemaFromEndpoints(endpoints, options);
};

export default createSchema;
