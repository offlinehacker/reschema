'use strict';

const _ = require('lodash');
let Joi = require('joi');

class TypableObject extends Object {
  constructor(value, type) {
    super(value);
    Object.defineProperty(this, '_type', {value: type});
  }
}

class TypableArray extends Object {
  constructor(value, type) {
    super(value);
    Object.defineProperty(this, '_type', {value: type});
  }
}

class TypableNumber extends Number {
  constructor(value, type) {
    super(value);
    Object.defineProperty(this, '_type', {value: type});
  }
}

class TypableString extends String {
  constructor(value, type) {
    super(value);
    Object.defineProperty(this, '_type', {value: type});
  }
}

class TypableBoolean extends Boolean {
  constructor(value, type) {
    super(value);
    Object.defineProperty(this, '_type', {value: type});
  }
}

class TypableDate extends Date {
  constructor(value, type) {
    super(value);
    Object.defineProperty(this, '_type', {value: type});
  }
}

function typableValidator(typeName, type) {
  return {
    base: Joi[typeName](),
    pre(value, state, options) {
      return new type(value, this._flags.type);
    },
    rules: [{
      name: 'type',
      params: {
        type: Joi.string().required()
      },
      setup(params) {
        this._flags.type = params.type;
      }
    }],
    name: typeName
  };
}

let extendedJoi = Joi
  .extend(typableValidator('array', TypableArray))
  .extend(typableValidator('object', TypableObject))
  .extend(typableValidator('number', TypableNumber))
  .extend(typableValidator('string', TypableString))
  .extend(typableValidator('boolean', TypableBoolean))
  .extend(typableValidator('date', TypableDate));

class JoiSchemaConverter {
  constructor(options) {
    this.options = options || {};

    if (this.options.embedTypes) {
      this.joi = extendedJoi;
    } else {
      this.joi = Joi;
    }
  }

  _createType(schema) {
    let type;

    switch (schema.validation.type) {
      case 'string':
        return this.joi.string();
      case 'number':
      case 'integer':
        type = this.joi.number();
        if (schema.validation.type === 'integer') {
          type = type.integer();
        }
        return type;
      case 'boolean':
        return this.joi.boolean();
      default:
        return this.joi.any();
    }
  }

  convert(schema, context) {
    let joiSchema;

    switch (schema.kind) {
      case 'alternatives':
        const alternatives = _.map(
          schema.alternatives,
          alternative => this.convert(alternative, context)
        );

        return this.joi.alternatives().try(alternatives);
      case 'value':
        if (!_.isEmpty(schema.properties)) {
          return this.joi.object()
            .keys(_.mapValues(schema.properties, property => {
              return this.convert(property, context);
            }));
        }

        if (schema.validation.values) {
          if (schema.meta.values) {
            return this.joi.alternatives().try(
              _.map(schema.meta.values, (meta, idx) => {
                const value = schema.validation.values[idx];
                const type = this._createType(schema);
                return type.allow(value);
              })
            );
          }

          return this.joi.allow(schema.validation.values);
        }

        return this._createType(schema);
      case 'array':
        return this.joi.array().items(this.convert(schema.items, context));
      case 'property':
        joiSchema = this.convert(schema.schema, context);

        if (schema.meta.description) {
          joiSchema.description(schema.meta.description);
        }

        return joiSchema;
      case 'type':
        joiSchema = this.convert(schema.schema, context);

        if (this.options.embedTypes) {
          joiSchema = joiSchema.type(schema.name);
        }

        if (schema.meta) {
          if (schema.meta.description) {
            joiSchema = joiSchema.description(schema.meta.description);
          }

          if (schema.meta.example) {
            joiSchema = joiSchema.example(schema.meta.example);
          }
        }

        return joiSchema;
    }
  }
}

module.exports = JoiSchemaConverter;
