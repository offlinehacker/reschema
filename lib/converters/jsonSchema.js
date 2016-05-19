'use strict';

const _ = require('lodash');

class JsonSchemaConverter {
  constructor(options) {
    this.options = options || {};
  }

  convert(schema, context) {
    let jsonSchema = {};

    switch(schema.kind) {
      case 'alternatives':
        return {
          anyOf: _.map(
            schema.alternatives,
            alternative => this.convert(alternative, context)
          )
        };
      case 'value':
        if (!_.isEmpty(schema.properties)) {
          jsonSchema.type = 'object';
          jsonSchema.properties = _.mapValues(schema.properties, property => {
            return this.convert(property, context);
          });
        } else {
          if (schema.validation.type) {
            jsonSchema.type = schema.validation.type;
          }

          if (schema.validation.values) {
            if (schema.meta.values) {
              jsonSchema.anyOf = _.map(schema.meta.values, (meta, idx) => {
                const value = schema.validation.values[idx];
                return {
                  type: schema.validation.type,
                  enum: [value],
                  title: meta.name
                };
              });
            } else {
              jsonSchema.enum = schema.validation.values;
            }
          }
        }

        return jsonSchema;
      case 'array':
        return {type: 'array', items: this.convert(schema.items, context)};
      case 'property':
        jsonSchema = this.convert(schema.schema, context);

        if (schema.meta.description) {
          jsonSchema.description = schema.meta.description;
        }

        return jsonSchema;
      case 'type':
        const typeName = schema.name.split('/').join('.');
        jsonSchema = this.convert(schema.schema, context);

        if (schema.meta) {
          if (schema.meta.description) {
            jsonSchema.description = schema.meta.description;
          }

          if (schema.meta.example) {
            jsonSchema.example = schema.meta.example;
          }
        }

        if (this.options.deref) {
          return jsonSchema;
        } else {
          _.set(context, ['definitions', typeName], jsonSchema);
          return {$ref: `#/definitions/${typeName}`};
        }
    }
  }
}

module.exports = JsonSchemaConverter;
