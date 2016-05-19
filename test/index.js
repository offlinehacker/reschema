'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');

const ReSchema = require('../lib');

describe('reschema', function () {
  it('should load schema', () => {
    const options = {
      loader: name => {
        if (name === 'type1') {
          return {
            name: 'type1',
            schema: {
              properties: {
                prop4: {
                  meta: {description: 'prop4'},
                  schema: {validation: {type: 'string'}}
                }
              }
            }
          };
        } else if (name === 'type2') {
          return {
            name: 'type2',
            meta: {description: 'type2'},
            schema: {
              validation: {type: 'integer'}
            }
          };
        } else if (name === 'type3') {
          return {
            name: 'type3',
            schema: 'type2'
          };
        }
      }
    };

    return ReSchema.create({
      extend: ['type1', {
        properties: {
          prop1: {schema: {validation: {type: 'string'}}},
          prop2: {schema: {validation: {type: 'string'}}}
        }
      }],
      properties: {
        prop1: {
          meta: {description: 'prop1'},
          schema: {validation: {type: 'integer'}}
        },
        prop3: {
          schema: [{
            meta: {description: 'stringprop3'},
            schema: {validation: {type: 'string'}},
          }, {
            meta: {description: 'intprop3'},
            schema: "type2"
          }]
        },
        prop5: 'type3',
        prop6: {schema: {items: 'type2'}}
      }
    }, options).then(schema => {
      expect(schema.kind).to.be.equal('value');
      expect(schema.properties).to.have.property('prop1');
      expect(schema.properties).to.have.property('prop2');
      expect(schema.properties).to.have.property('prop3');
      expect(schema.properties).to.have.property('prop4');
      expect(schema.properties.prop1.kind).to.be.equal('property');

      expect(schema.properties.prop1.meta)
        .to.be.deep.equal({description: 'prop1'});
      expect(schema.properties.prop1.schema.validation)
        .to.be.deep.equal({type: 'integer'});
      expect(schema.properties.prop1.meta.description).to.be.equal('prop1');
      expect(schema.properties.prop3.schema.kind).to.be.equal('alternatives');
      expect(schema.properties.prop3.schema.alternatives[0].meta.description)
        .to.be.deep.equal('stringprop3');
      expect(schema.properties.prop3.schema.alternatives[0].schema.validation)
        .to.be.deep.equal({type: 'string'});
      expect(schema.properties.prop3.schema.alternatives[1].schema.schema.validation)
        .to.be.deep.equal({type: 'integer'});

      expect(schema.properties.prop5.schema.kind).to.be.equal('type');
      expect(schema.properties.prop5.schema.name).to.be.equal('type2');

      expect(schema.properties.prop6.schema.kind).to.be.equal('array');
      expect(schema.properties.prop6.schema.items.kind).to.be.equal('type');
      expect(schema.properties.prop6.schema.items.name).to.be.equal('type2');
    });
  });

  describe('json schema', () => {
    it('should convert simple value schema', () => {
      return ReSchema.create(
        {validation: {type: 'string'}}
      ).then(schema => {
        const jsonSchema = schema.to('JsonSchema');
        expect(jsonSchema.type).to.be.equal('string');
      });
    });

    it('should convert object schema', () => {
      return ReSchema.create({
        properties: {
          prop1: {
            meta: {description: 'prop1'},
            schema: {validation: {type: 'string'}}
          },
          prop2: {
            meta: {description: 'prop2'},
            schema: {
              properties: {
                subprop1: {
                  meta: {description: 'subprop1'},
                  schema: {validation: {type: 'integer'}}
                }
              }
            }
          }
        }
      }).then(schema => {
        const context = {};
        const jsonSchema = schema.to('JsonSchema', null, context);

        expect(jsonSchema).to.be.deep.equal({
          type: 'object',
          properties: {
            prop1: {type: 'string', description: 'prop1'},
            prop2: {
              type: 'object',
              description: 'prop2',
              properties: {
                subprop1: {
                  type: 'integer', description:'subprop1'
                }
              }
            }
          }
        })
      });
    });

    it('should convert referencing schema', () => {
      const options = {
        loader: sinon.stub().returns({
          name: 'type2',
          meta: {description: 'type2'},
          schema: {
            validation: {type: 'integer'}
          }
        })
      };

      const context = {};
      return ReSchema.create({
        properties: {
          prop1: 'type2'
        }
      }, options).then(schema => {
        const jsonSchema = schema.to('JsonSchema', null, context);

        expect(jsonSchema).to.be.deep.equal({
          type: 'object',
          properties: {
            prop1: {
              $ref: '#/definitions/type2',
              description: 'type2'
            }
          }
        });

        expect(context).to.be.deep.equal({
          definitions: {type2: {type: 'integer', description: 'type2'}}
        });
      });
    });

    it('should convert array schema', () => {
      return ReSchema.create({
        items: {validation: {type: 'string'}}
      }).then(schema => {
        const jsonSchema = schema.to('JsonSchema');
        expect(jsonSchema).to.be.deep.equal({
          type: 'array',
          items: {type: 'string'}
        });
      });
    });

    it('should convert alternatives schema', () => {
      return ReSchema.create([
        {validation: {type: 'string'}},
        {validation: {type: 'integer'}}
      ]).then(schema => {
        const jsonSchema = schema.to('JsonSchema');
        expect(jsonSchema).to.be.deep.equal({
          anyOf: [{type: 'string'}, {type: 'integer'}]
        });
      });
    });
  });
});
