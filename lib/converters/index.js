'use strict';

const _ = require('lodash');

const JsonSchemaConverter = require('./jsonSchema');
const JoiSchemaConverter = require('./joi');

class SchemaConverterFactory {
  static create(type, options) {
    switch(_.toLower(type)) {
      case 'jsonschema':
        return new JsonSchemaConverter(type, options);
      case 'joi':
        return new JoiSchemaConverter(options);
      default:
        throw new Error('converter loading not implemented');
    }
  }
}

module.exports = SchemaConverterFactory;
