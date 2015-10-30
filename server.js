"use strict"
var express = require("express");
var EE = require("events").EventEmitter;
var Env = require("./lib/environment");
var Bluebird = require("bluebird");
var spawn = require("child_process").spawn;
var bodyParser = require("body-parser");

var correlationManager = new EE();
var openCorrelations = {};

correlationManager.on("add-correlation", function(correlationId, handler){
  openCorrelations[correlationId] = handler;
});
correlationManager.on("request-end", function(req){
  if(openCorrelations[req.correlationId]){
    var handler = openCorrelations[req.correlationId];
    delete openCorrelations[req.correlationId]
    handler(req);
  }
});

var e = new Env({id:"test"}, correlationManager);

function downloadStartingPoint(path) {
  var defer = Bluebird.defer();
  var proc = spawn("npm", ["install", "edc-start-" + path]);
  proc.on("close", (code) => {
    if(code === 0){
      defer.resolve("edc-start-" + path);
    } else {
      defer.reject("npm install edc-start-" + path + " received status code: " +  code);
    }
  });

  var prom = defer.promise;

  return prom;
}

var app = express();

app.get("/start/:id", function(req, res){
  var id = req.params.id;
  downloadStartingPoint(id)
    .then(function(path){
      var req = require(path).createRequest();
      delete require.cache[path];
      correlationManager.emit("add-correlation", req.correlationId, function(request){
        if(request.statusCode !== 0){
          res.status(500).send(request.statusCode);
        } else {
          res.status(200).send(request.body);
        }
      })
      e.emit("request-start", req);

    })
    .catch((err) => {
      res.status(404).send(err);
    });
});

app.get("/purge", function(req, res){
  e.emit("purge");
  res.status(200).end();
});

app.listen(3030);
