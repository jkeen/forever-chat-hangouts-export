var mocha          = require('mocha');
var chai           = require('chai');
var chaiAsPromised = require("chai-as-promised");
var expect         = chai.expect;
var _              = require('underscore');
var importer       = require('../index');

chai.use(chaiAsPromised);

var _this = this;
describe("basics", function () {
  it('should throw an error when called without a path', function() {
    var hangoutsImport = importer();
    return hangoutsImport.then(function() {
    }, function(reason) {
        expect(reason).to.equal('Could not read file at path');
    });
  });
});

var formatTests    = require('forever-chat-format');
var importData     = importer("test.json");
formatTests(importData);

importData.then(function(d) {
  // console.log(JSON.stringify(d));
});
