'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');

const Reschema = require('../lib');

describe('reschema', function () {
  it('should validate schema', () => {
    const reschema = new Reschema({
      type: 'sometype',
      description: 'test',
      properties: {
        prop1: {
          description: 'Prop 1',
          extend: [
            {type: 'typeone'},
            {type: 'typetwo'}
          ],
          omit: ["prop2"],
          properties: {
            prop2: {
              type: 'somethirdtype',
              array: true
            }
          }
        }
      }
    });
  });

  it('should convert to json schema', () => {
    const loaderStub = sinon.stub().returns({
      name: 'someothertype',
      schema: {
        properties: {
          prop1: {validation: {type: 'string'}},
          prop2: {validation: {type: 'integer'}},
          prop5: {
            alternatives: [
              {validation: {type: 'string'}},
              {validation: {type: 'integer'}}
            ]
          }
        }
      }
    });

    const reschema = new Reschema({
      description: 'some description',
      array: true,
      properties: {
        prop1: {
          type: 'someothertype',
          properties: {
            prop4: {validation: {type: 'boolean'}}
          }
        }
      }
    }, {loader: loaderStub});

    const context = {};
    return reschema.toJSONSchema(context).then(jsonSchema => {
      expect(jsonSchema).to.be.deep.equal({
        type: "array",
        items:{
          type: "object",
          properties: {
            prop1: {
              type: 'object',
              allOf: [
                {$ref: '#/definitions/someothertype'},
                {
                  type: 'object',
                  properties: {
                    prop4: {type: 'boolean'}
                  }
                }
              ]
            }
          }
        },
        description: 'some description'
      });
      expect(context).to.be.deep.equal({
        definitions: {
          someothertype: {
            type: "object",
            properties: {
              prop1: {type: "string"},
              prop2: {type:"integer"},
              prop5: {
                type: 'object',
                anyOf: [
                  {type: 'string'},
                  {type: 'integer'}
                ]
              }
            }
          }
        }
      });
    });
  });

  it('should resolve schema', () => {
    const reschema = new Reschema({
      extend: [{
        description: 'some description',
        properties: {
          prop1: {description: 'prop1'},
          prop2: {description: 'prop2'}
        }
      }, {
        description: 'some other description',
        properties: {
          prop3: {description: 'prop3'},
          prop1: {description: 'newprop1'}
        }
      }],
      properties: {
        prop4: {description: 'prop4'}
      }
    });

    return reschema.expandProperties().then(properties => {
      expect(properties).to.have.property('prop1');
      expect(properties).to.have.property('prop2');
      expect(properties).to.have.property('prop3');
      expect(properties).to.have.property('prop4');
      expect(properties.prop1.description).to.be.equal('newprop1');
    });
  });
});
