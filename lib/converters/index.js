'use strict';

const _ = require('lodash');

const JsonSchemaConverter = require('./jsonSchema');

class SchemaConverterFactory {
  static create(type, options) {
    switch(_.toLower(type)) {
      case 'jsonschema':
        return new JsonSchemaConverter(type, options);
    }
  }
}

module.exports = SchemaConverterFactory;
