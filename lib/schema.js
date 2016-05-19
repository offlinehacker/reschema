
'use strict';

const Joi = require('joi');
const _ = require('lodash');
const Promise = require('bluebird');

class Schema {
  constructor(schema, options) {
    this._schema = schema;
    this._options = options;
  }

  get schema() {
    throw new Error('no subschema defined');
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

    Joi.assert(schema, Joi.object({
      alternatives: Joi.array().items(Joi.any()).required()
    }), 'invalid alternatives schema');

    this._alternatives = [];
  }

  get kind() {
    return 'alternatives';
  }

  get alternatives() {
    return this._alternatives;
  }

  load() {
    return Promise.map(this._schema.alternatives, schema => {
      return PropertySchema.create(schema, this._options).then(schema => {
        this._alternatives.push(schema);
      });
    }).return(this);
  }

  static create(schema, options) {
    if (_.isArray(schema)) {
      schema = {alternatives: schema};
    }

    return new AlternativesSchema(schema, options).load();
  }
}

class ValueSchema extends Schema {
  constructor(schema, options) {
    super(schema, options);

    Joi.assert(schema, Joi.object({
      extend: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.any())
      ),
      validation: Joi.object(),
      properties: Joi.object()
    }).unknown(), 'invalid value schema');

    this._extend = [];
    this._properties = {};
  }

  get kind() {
    return 'value';
  }

  get schema() {
    return this._schema;
  }

  get meta() {
    return this._schema.meta || {};
  }

  _parentProperty(name) {
    return _.chain(this.schema._extend)
      .find(schema => !_.isUndefined(schema[name])).get(name).value();
  }

  get validation() {
    const parentValidation = _.cloneDeep(this._parentProperty('validation'));
    return _.extend(parentValidation, this._schema.validation);
  }

  get properties() {
    const properties = {};

    _.forEach(this._extend, schema => {
      _.extend(properties, schema.schema.properties);
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
}

class ArraySchema extends Schema {
  constructor(schema, options) {
    super(schema, options);

    Joi.assert(schema, Joi.object({
      items: Joi.any().required()
    }), 'invalid array schema');
  }

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

  static create(schema, options) {
    return new ArraySchema(schema, options).load();
  }
}

class PropertySchema extends Schema {
  constructor(schema, options) {
    super(schema, options);

    Joi.assert(schema, Joi.object({
      meta: Joi.object(),
      schema: Joi.any().required()
    }), 'invalid array schema');
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

    return {};
  }

  get schema() {
    return this._loaded;
  }

  load() {
    return Schema.create(this._schema.schema, this._options).then(schema => {
      this._loaded = schema;
    }).return(this);
  }

  static create(schema, options) {
    if (_.isString(schema) || !_.has(schema, 'schema')) {
      schema = {schema: schema};
    }

    return new PropertySchema(schema, options).load();
  }
}

class TypeSchema extends Schema {
  constructor(type, options) {
    super(type.schema, options);

    Joi.assert(type, Joi.object({
      name: Joi.string().required(),
      meta: Joi.object(),
      schema: Joi.any()
    }).unknown(), 'invalid type schema');

    this._type = type;
  }

  get kind() {
    return 'type';
  }

  get name() {
    return this._type.name;
  }

  get meta() {
    return this._type.meta || {};
  }

  get schema() {
    return this._loaded;
  }

  load() {
    return Schema.create(this._schema, this._options).then(schema => {
      this._loaded = schema;
    }).return(this);
  }

  static create(name, options) {
    Joi.assert(name, Joi.string().required(), 'wrong type name');
    Joi.assert(_.get(options, 'loader'), Joi.func().required(), 'missing loader');

    return Promise.resolve(options.loader(name)).then(type => {
      if (_.isString(type.schema)) {
        return TypeSchema.create(type.schema, options);
      }

      return new TypeSchema(type, options).load();
    });
  }
}

module.exports = Schema;
