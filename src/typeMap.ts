// TODO: fix no-param-reassign
/* eslint-disable no-param-reassign */
import {
  GraphQLBoolean,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLScalarType,
  GraphQLString,
  Thunk,
} from 'graphql';
import {
  isArrayType,
  isBodyType,
  isObjectType,
  JSONSchemaType,
} from './json-schema';
import { EndpointParam } from './getRequestOptions';

export interface GraphQLInputTypeMap {
  [typeName: string]: GraphQLInputType;
}

export interface GraphQLOutputTypeMap {
  [typeName: string]: GraphQLOutputType;
}
const primitiveTypes = {
  string: GraphQLString,
  date: GraphQLString,
  integer: GraphQLInt,
  number: GraphQLFloat,
  boolean: GraphQLBoolean,
};

const jsonType = new GraphQLScalarType({
  name: 'JSON',
  serialize(value) {
    return value;
  },
});

function getPrimitiveType(
  format: string | undefined,
  type: keyof typeof primitiveTypes,
): GraphQLScalarType {
  const primitiveTypeName = format === 'int64' ? 'string' : type;
  const primitiveType = primitiveTypes[primitiveTypeName];
  if (!primitiveType) {
    return primitiveTypes.string;
  }
  return primitiveType;
}

export const jsonSchemaTypeToOutputGraphQL = (
  title: string,
  jsonSchema: JSONSchemaType,
  propertyName: string,
  gqlTypes: GraphQLOutputTypeMap,
  required: boolean,
): GraphQLOutputType => {
  const baseType: GraphQLOutputType = ((): GraphQLOutputType => {
    if (isBodyType(jsonSchema)) {
      return jsonSchemaTypeToOutputGraphQL(
        title,
        jsonSchema.schema,
        propertyName,
        gqlTypes,
        required,
      );
    }
    if (isObjectType(jsonSchema) || isArrayType(jsonSchema)) {
      // eslint-disable-next-line no-use-before-define,@typescript-eslint/no-use-before-define
      return createGraphQLOutputType(
        jsonSchema,
        `${title}_${propertyName}`,
        gqlTypes,
      );
    }

    if (jsonSchema.type === 'file') {
      // eslint-disable-next-line no-use-before-define,@typescript-eslint/no-use-before-define
      return createGraphQLOutputType(
        {
          type: 'object',
          required: [],
          properties: { unsupported: { type: 'string' } },
        },
        `${title}_${propertyName}`,
        gqlTypes,
      );
    }

    if (jsonSchema.type) {
      return getPrimitiveType(jsonSchema.format, jsonSchema.type);
    }
    throw new Error(
      `Don't know how to handle schema ${JSON.stringify(
        jsonSchema,
      )} without type and schema`,
    );
  })();
  if (required) return GraphQLNonNull(baseType) as GraphQLOutputType;
  return baseType as GraphQLOutputType;
};

export const jsonSchemaTypeToInputGraphQL = (
  title: string,
  jsonSchema: JSONSchemaType,
  propertyName: string,
  gqlTypes: GraphQLInputTypeMap,
  required: boolean,
): GraphQLInputType => {
  const baseType = ((): GraphQLInputType => {
    if (isBodyType(jsonSchema)) {
      return jsonSchemaTypeToInputGraphQL(
        title,
        jsonSchema.schema,
        propertyName,
        gqlTypes,
        required,
      );
    }
    if (isObjectType(jsonSchema) || isArrayType(jsonSchema)) {
      // eslint-disable-next-line no-use-before-define,@typescript-eslint/no-use-before-define
      return createGraphQLInputType(
        jsonSchema,
        `${title}_${propertyName}`,
        gqlTypes,
      );
    }

    if (jsonSchema.type === 'file') {
      // eslint-disable-next-line no-use-before-define,@typescript-eslint/no-use-before-define
      return createGraphQLInputType(
        {
          type: 'object',
          required: [],
          properties: { unsupported: { type: 'string' } },
        },
        `${title}_${propertyName}`,
        gqlTypes,
      );
    }

    if (jsonSchema.type) {
      return getPrimitiveType(jsonSchema.format, jsonSchema.type);
    }
    throw new Error(
      `Don't know how to handle schema ${JSON.stringify(
        jsonSchema,
      )} without type and schema`,
    );
  })();

  if (required) return GraphQLNonNull(baseType) as GraphQLInputType;
  return baseType as GraphQLInputType;

  // return (required
  //   ? GraphQLNonNull(baseType)
  //   : baseType) as IsInputType extends true
  //   ? GraphQLInputType
  //   : GraphQLOutputType;
};

const makeValidName = (name: string): string =>
  name.replace(/[^_0-9A-Za-z]/g, '_');

export const getInputTypeFields = (
  jsonSchema: JSONSchemaType,
  title: string,
  gqlTypes: GraphQLInputTypeMap,
): Thunk<GraphQLInputFieldConfigMap> => {
  return () => {
    const properties: { [name: string]: JSONSchemaType } = {};
    if (isObjectType(jsonSchema)) {
      Object.keys(jsonSchema.properties).forEach((key) => {
        properties[makeValidName(key)] = jsonSchema.properties[key];
      });
    }
    return Object.keys(properties).reduce<GraphQLInputFieldConfigMap>(
      (prev: GraphQLInputFieldConfigMap, propertyName: string) => {
        const propertySchema = properties[propertyName];
        const fieldConfig = jsonSchemaTypeToInputGraphQL(
          title,
          propertySchema,
          propertyName,
          gqlTypes,
          !!(
            isObjectType(jsonSchema) &&
            jsonSchema.required &&
            jsonSchema.required.includes(propertyName)
          ),
        );
        return {
          ...prev,
          [propertyName]: {
            type: fieldConfig,
            description: propertySchema.description,
          },
        };
      },
      {},
    );
  };
};

export const getOutputTypeFields = (
  jsonSchema: JSONSchemaType,
  title: string,
  gqlTypes: GraphQLOutputTypeMap,
): Thunk<GraphQLFieldConfigMap<any, any>> => {
  return () => {
    const properties: { [name: string]: JSONSchemaType } = {};
    if (isObjectType(jsonSchema)) {
      Object.keys(jsonSchema.properties).forEach((key) => {
        properties[makeValidName(key)] = jsonSchema.properties[key];
      });
    }
    const result = Object.keys(properties).reduce<
      GraphQLFieldConfigMap<any, any>
    >((prev, propertyName) => {
      const propertySchema = properties[propertyName];
      const fieldConfig = jsonSchemaTypeToOutputGraphQL(
        title,
        propertySchema,
        propertyName,
        gqlTypes,
        !!(
          isObjectType(jsonSchema) &&
          jsonSchema.required &&
          jsonSchema.required.includes(propertyName)
        ),
      );
      return {
        ...prev,
        [propertyName]: {
          type: fieldConfig,
          description: propertySchema.description,
        },
      };
    }, {});
    return result;
  };
};

export const createGraphQLInputType = (
  jsonSchema: JSONSchemaType | undefined,
  title: string,
  gqlTypes: GraphQLInputTypeMap,
): GraphQLInputType => {
  title = (jsonSchema && jsonSchema.title) || title;
  title = makeValidName(title);

  if (!title.endsWith('Input')) title += 'Input';

  if (title in gqlTypes) return gqlTypes[title];

  if (!jsonSchema) {
    jsonSchema = {
      type: 'object',
      properties: {},
      required: [],
      description: undefined,
      title,
    };
  } else if (!jsonSchema.title) {
    jsonSchema = { ...jsonSchema, title };
  }

  if (isArrayType(jsonSchema)) {
    const itemsSchema = Array.isArray(jsonSchema.items)
      ? jsonSchema.items[0]
      : jsonSchema.items;
    if (isObjectType(itemsSchema) || isArrayType(itemsSchema)) {
      return new GraphQLList(
        GraphQLNonNull(
          createGraphQLInputType(itemsSchema, `${title}_items`, gqlTypes),
        ),
      );
    }

    if (itemsSchema.type === 'file') {
      // eslint-disable-next-line no-use-before-define,@typescript-eslint/no-use-before-define
      return new GraphQLList(
        GraphQLNonNull(
          createGraphQLInputType(
            {
              type: 'object',
              required: [],
              properties: { unsupported: { type: 'string' } },
            },
            title,
            gqlTypes,
          ),
        ),
      );
    }
    const primitiveType = getPrimitiveType(
      itemsSchema.format,
      itemsSchema.type,
    );
    return new GraphQLList(GraphQLNonNull(primitiveType));
  }

  if (
    isObjectType(jsonSchema) &&
    !Object.keys(jsonSchema.properties || {}).length
  ) {
    return jsonType;
  }

  const { description } = jsonSchema;
  const fields = getInputTypeFields(jsonSchema, title, gqlTypes);
  const result = new GraphQLInputObjectType({
    name: title,
    description,
    fields: fields as GraphQLInputFieldConfigMap,
  });
  gqlTypes[title] = result;
  return result;
};

export const createGraphQLOutputType = (
  jsonSchema: JSONSchemaType | undefined,
  title: string,
  gqlTypes: GraphQLOutputTypeMap,
): GraphQLOutputType => {
  title = (jsonSchema && jsonSchema.title) || title;
  title = makeValidName(title);

  if (title in gqlTypes) return gqlTypes[title];

  if (!jsonSchema) {
    jsonSchema = {
      type: 'object',
      properties: {},
      required: [],
      description: undefined,
      title,
    };
  } else if (!jsonSchema.title) {
    jsonSchema = { ...jsonSchema, title };
  }

  if (isArrayType(jsonSchema)) {
    const itemsSchema = Array.isArray(jsonSchema.items)
      ? jsonSchema.items[0]
      : jsonSchema.items;
    if (isObjectType(itemsSchema) || isArrayType(itemsSchema)) {
      return new GraphQLList(
        GraphQLNonNull(
          createGraphQLOutputType(itemsSchema, `${title}_items`, gqlTypes),
        ),
      );
    }

    if (itemsSchema.type === 'file') {
      // eslint-disable-next-line no-use-before-define,@typescript-eslint/no-use-before-define
      return new GraphQLList(
        GraphQLNonNull(
          createGraphQLOutputType(
            {
              type: 'object',
              required: [],
              properties: { unsupported: { type: 'string' } },
            },
            title,
            gqlTypes,
          ),
        ),
      );
    }
    const primitiveType = getPrimitiveType(
      itemsSchema.format,
      itemsSchema.type,
    );
    return new GraphQLList(GraphQLNonNull(primitiveType));
  }

  if (
    isObjectType(jsonSchema) &&
    !Object.keys(jsonSchema.properties || {}).length
  ) {
    return jsonType;
  }

  const { description } = jsonSchema;

  const fields = getOutputTypeFields(jsonSchema, title, gqlTypes);
  const result = new GraphQLObjectType({
    name: title,
    description,
    fields: fields as GraphQLFieldConfigMap<any, any>,
  });
  gqlTypes[title] = result;
  return result;
};

export const mapParametersToInputFields = (
  parameters: EndpointParam[],
  typeName: string,
  gqlTypes: GraphQLInputTypeMap,
): GraphQLFieldConfigArgumentMap => {
  return parameters
    .filter((param) => param.type !== 'header')
    .reduce((res: GraphQLFieldConfigArgumentMap, param) => {
      const type = jsonSchemaTypeToInputGraphQL(
        `param_${typeName}`,
        param.jsonSchema,
        param.name,
        gqlTypes,
        param.required,
      );
      res[param.name] = {
        type,
      };
      return res;
    }, {});
};
