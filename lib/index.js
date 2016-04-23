
'use strict';

const fs = require('fs');
const path = require('path');

const ajv = require('ajv');
const Joi = require('joi');
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
    Joi.assert(options, Joi.object({
      loader: Joi.func()
    }));

    this._schema = schema;
    this._options = options;
  }

  static create(schema, options) {
    if (_.isString(schema)) {
      return TypeSchema.create(schema, options);
    } else if (_.isArray(schema)) {
      return AlternativesSchema.create(schema, options);
    } else if (_.has(schema, 'items')) {
      return ArraySchema.create(schema, options);
    } else {
      return ValueSchema.create(schema, options);
    }
  }
}

class AlternativesSchema extends Schema {
  constructor(schema, options) {
    super(schema, options);

    this._alternatives = [];
  }

  get kind() {
    return 'alternatives';
  }

  get alternatives() {
    return this._alternatives;
  }

  load() {
    return Promise.map(this._schema, schema => {
      return Schema.create(schema, this._options).then(schema => {
        this._alternatives.push(schema);
      });
    }).return(this);
  }

  toJSONSchema(context) {
    return {
      type: 'object',
      anyOf: _.map(this.alternatives, schema => schema.toJSONSchema(context))
    };
  }

  static create(schema, options) {
    return new AlternativesSchema(schema, options).load();
  }
}

class ValueSchema extends Schema {
  constructor(schema, options) {
    super(schema, options);

    this._extend = [];
    this._properties = {};
  }

  get kind() {
    return 'value';
  }

  _parentProperty(name) {
    return _.chain(this._extend)
      .find(schema => !_.isUndefined(schema[name])).get(name).value();
  }

  get description() {
    return this._parentProperty('description') || this._schema.description;
  }

  get validation() {
    const parentValidation = _.cloneDeep(this._parentProperty('validation'));
    return _.extend(parentValidation, this._schema.validation);
  }

  get properties() {
    const properties = {};

    _.forEach(this._extend, schema => {
      _.extend(properties, schema.properties);
    });

    _.extend(properties, this._properties);

    return properties;
  }

  get extend() {
    return this._extend;
  }

  load() {
    let extend = this._schema.extend;

    if (!extend) {
      extend = [];
    } else if (!_.isArray(extend)) {
      extend = [this._schema.extend];
    }

    return Promise.all([
      // Load all the properties
      Promise.all(_.map(this._schema.properties, (property, name) => {
        return PropertySchema.create(property, this._options).then(schema => {
          this._properties[name] = schema;
        });
      })),

      // Load all extensions
      Promise.map(extend, data => {
        return Schema.create(data, this._options).then(schema => {
          this._extend.push(schema);
        });
      })
    ]).return(this);
  }

  static create(schema, options) {
    return new ValueSchema(schema, options).load();
  }

  toJSONSchema(context) {
    const jsonSchema = {};

    if (!_.isEmpty(this.properties)) {
      jsonSchema.type = 'object';
      jsonSchema.properties = _.mapValues(this.properties, property => {
        return property.toJSONSchema(context);
      });
    } else {
      if (this.validation.type) {
        jsonSchema.type = this.validation.type;
      }
    }

    return jsonSchema;
  }
}

class ArraySchema extends Schema {
  get kind() {
    return 'array';
  }

  get validation() {
    return this._schema.validation;
  }

  get items() {
    return this._loaded;
  }

  load() {
    return Schema.create(this._schema.items, this._options).then(schema => {
      this._loaded = schema;
    }).return(this);
  }

  toJSONSchema(context) {
    return {type: 'array', items: this.items.toJSONSchema(context)};
  }

  static create(schema, options) {
    return new ArraySchema(schema, options).load();
  }
}

class PropertySchema extends Schema {
  constructor(schema, options) {
    super(schema, options);
  }

  get kind() {
    return 'property';
  }

  get meta() {
    if (this._schema.meta) {
      return this._schema.meta;
    }

    if (this.schema.kind === 'type') {
      return this.schema.meta;
    }
  }

  get schema() {
    return this._loaded;
  }

  load() {
    return Schema.create(this._schema.schema, this._options).then(schema => {
      this._loaded = schema;
    }).return(this);
  }

  toJSONSchema(context) {
    return this.schema.toJSONSchema(context);
  }

  static create(schema, options) {
    if (_.isString(schema)) {
      schema = {schema: schema};
    }

    return new PropertySchema(schema, options).load();
  }
}

class TypeSchema extends ValueSchema {
  constructor(type, options) {
    super(type.schema, options);

    this._type = type;
  }

  get kind() {
    return 'type';
  }

  get name() {
    return this._type.name;
  }

  get meta() {
    return this._type.meta;
  }

  load() {
    if (_.isString(this._schema)) {
      return TypeSchema.create(this._schema, this._options);
    }

    return super.load();
  }

  toJSONSchema(context) {
    const typeName = this.name.split('/').join('.');
    const jsonSchema = super.toJSONSchema(context);

    if (this.meta) {
      if (this.meta.description) {
        jsonSchema.description = this.meta.description;
      }
    }

    _.set(context, ['definitions', typeName], jsonSchema);

    return {$ref: `#!/definitions/${typeName}`};
  }

  static create(name, options) {
    Joi.assert(name, Joi.string().required(), 'wrong time name');
    Joi.assert(_.get(options, 'loader'), Joi.func().required(), 'missing loader');

    return Promise.resolve(options.loader(name)).then(type => {
      return new TypeSchema(type, options).load();
    });
  }
}

module.exports = Schema;
