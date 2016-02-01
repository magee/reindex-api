import { GraphQLNonNull, GraphQLObjectType } from 'graphql';
import { GraphQLError } from 'graphql/error/GraphQLError';
import { chain, camelCase } from 'lodash';

import ReindexID from '../builtins/ReindexID';
import checkPermission from '../permissions/checkPermission';

export default function createGetByField({ type }, interfaces) {
  return extractUniqueFields(type, interfaces).map(({
    name: fieldName,
    type: fieldType,
    prefix,
  }) => {
    const nameChain = prefix.concat([fieldName]);
    return {
      name: camelCase(`${type.name} by ${nameChain.join(' ')}`),
      description:
`Get an object of type \`${type.name}\` by \`${nameChain.join('.')}\``,
      type,
      args: {
        [fieldName]: {
          name: fieldName,
          description: `\`${nameChain.join('.')}\` of \`${type.name}\``,
          type: new GraphQLNonNull(fieldType),
        },
      },
      async resolve(parent, args, context) {
        const { db } = context.rootValue;
        const value = args[fieldName];
        if (fieldType === ReindexID && !db.isValidID(type.name, value)) {
          throw new GraphQLError(`id: Invalid ID for type ${type.name}`);
        }
        const result = await db.getByField(
          type.name,
          nameChain,
          value,
          context.rootValue.indexes[type.name],
        );
        await checkPermission(type.name, 'read', {}, result, context);
        return result;
      },
    };
  });
}

function extractUniqueFields(type, interfaces, prefix = []) {
  return chain(type.getFields())
    .map((field) => {
      const fieldType = field.type.ofType || field.type;
      if (fieldType instanceof GraphQLObjectType &&
          !fieldType.getInterfaces().includes(interfaces.Node)) {
        return extractUniqueFields(
          fieldType,
          interfaces,
          prefix.concat([field.name]
        ));
      } else if (field.metadata && field.metadata.unique) {
        return [{
          name: field.name,
          type: fieldType,
          prefix,
        }];
      } else {
        return [];
      }
    })
    .flatten()
    .value();
}
