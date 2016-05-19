const Schema = require('./schema');
const SchemaConverterFactory = require('./converters');

Schema.prototype.to = function(type, options, context) {
  const converter = SchemaConverterFactory.create(type, options);
  return converter.convert(this, context);
};

module.exports = Schema;
