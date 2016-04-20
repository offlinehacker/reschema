'use strict';

const fs = require('fs');
const path = require('path');

const ajv = require('ajv');
const YAML = require('yamljs');
const _ = require('lodash');
const Promise = require('bluebird');

const cache = require('./cache');
const schemaFile = path.join(__dirname, './schema.yaml');

const validate = ajv().compile(
  YAML.parse(fs.readFileSync(schemaFile, 'utf-8'))
);

class Schema {
  constructor(schema, options) {
    this._schema = _.defaults(schema, {
      validation: {}
    });
    this._options = _.defaults(options, {
      loader: () => {
        throw new Error('loader not provided');
      }
    });
    this._cache = cache();
  }

  get description() {
    return this._schema.description;
  }

  get validation() {
    return this._schema.validation;
  }

  get type() {
    return this._schema.type;
  }

  get array() {
    return this._schema.array;
  }

  get properties() {
    return this._cache('props', _.mapValues(this._schema.properties, property => {
      return new Schema(property, this._options);
    }));
  }

  get extend() {
    return this._cache('extend', _.map(this._schema.extend, schema => {
      return new Schema(schema, this._options);
    }));
  }

  get alternatives() {
    return this._cache('alternatives', _.map(this._schema.alternatives, schema => {
      return new Schema(schema, this._options);
    }));
  }

  loadType(type) {
    return Promise.resolve(this._options.loader(type)).then(type => {
      return new Type(type.name, type.schema, this._options);
    });
  }

  expandProperties() {
    const properties = {};
    let resolved;

    if (this.type) {
      resolved = this.loadType(this.type).then(type => {
        return _.extend(properties, type.properties);
      });
    } else if (this.extend) {
      resolved = Promise.map(this.extend, subSchema => {
        return subSchema.expandProperties();
      }).reduce((properties, baseProperties) => {
        return _.extend(properties, baseProperties);
      }, properties);
    } else {
      return Promise.resolve(properties);
    }

    return resolved.then(properties => {
      return _.extend(properties, this.properties);
    });
  }

  toJSONSchema(context) {
    context = _.defaults(context, {definitions: {}});

    const baseSchema = {};
    const jsonSchema = {};

    if (this.description) {
      baseSchema.description = this.description;
    }

    if (this.validation.type) {
      jsonSchema.type = this.validation.type;
    }

    return Promise.props(_.mapValues(this.properties, prop => {
      return prop.toJSONSchema(context);
    })).then(properties => {
      if (!_.isEmpty(properties)) {
        jsonSchema.type = 'object';
        jsonSchema.properties = properties;
      }

      if (this.type) {
        return this.loadType(this.type).then(type => {
          return type.toJSONSchema(context).then(parentSchema => {
            const typeName = type.name.replace(/\//g, '.');
            context.definitions[typeName] = parentSchema;
            const reference = `#/definitions/${typeName}`;
            return _.isEmpty(jsonSchema) ?
              {$ref: reference} :
              {type: 'object', allOf: [{$ref: reference}, jsonSchema]};
          });
        });
      } else if (!_.isEmpty(this.extend)) {
        return Promise.map(this.extend, schema => {
          return schema.toJSONSchema(context);
        }).then(schemas => {
          return {
            type: 'object',
            allOf: _.isEmpty(jsonSchema) ? schemas: schemas.concat([jsonSchema])};
        });
      } else if (!_.isEmpty(this.alternatives)) {
        return Promise.map(this.alternatives, schema => {
          return schema.toJSONSchema(context);
        }).then(schemas => {
          return {
            type: 'object',
            anyOf: _.isEmpty(jsonSchema) ? schemas: schemas.concat([jsonSchema])
          };
        });
      }

      return jsonSchema;
    }).then(jsonSchema => {
      if (this.array) {
        return {type: 'array', items: jsonSchema};
      }

      return jsonSchema;
    }).then(jsonSchema => {
      return _.extend(jsonSchema, baseSchema);
    });
  }

  static validate(schema) {
    return validate(schema);
  }

  static create(data, options) {
    if (!Schema.validate(data)) {
      throw new Error('Invalid schema: ' + JSON.stringify(validate.errors));
    }

    return new Schema(data, options);
  }
}

class Type extends Schema {
  constructor(name, schema, options) {
    super(schema, options);
    this.name = name;
  }
}

module.exports = Schema;
