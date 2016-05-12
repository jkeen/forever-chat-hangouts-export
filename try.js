var importer       = require('./index');
var importData     = importer("hangouts.json").then(function(payload) {
  console.log(payload)
});
