"use strict"
var express = require("express");
var EE = require("events").EventEmitter;
var Env = require("./lib/environment");
var Request = require("basic-distributed-computation").Request;
var Bluebird = require("bluebird");
var spawn = require("child_process").spawn;
var bodyParser = require("body-parser");
var fs = require("fs");
var glob = require("glob");
var winston = require("winston")
winston.add(winston.transports.File, { filename: 'logs/' + (process.env.LOG_FILE || "app.log") });
if(process.env.DEBUG === "true"){
  winston.level = "debug";
}
var e = new Env({id:"test", lb:"http://localhost:3031", url:"http://localhost:" + (process.env.NODE_PORT || 3030)});

function downloadStartingPoint(path) {
  var defer = Bluebird.defer();
  var proc = spawn("npm", ["install", "edc-start-" + path]);
  winston.log("info", "downloading", {startingPoint:  "edc-start-" + path});
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
      var req = require(path).createRequest({});
      delete require.cache[path];
      var handler = function(err, request){
        if(err){
          res.status(500).send(err);
        } else {
          res.status(200).send(request[1]);
        }
      }

      e.emit("request-start", req, handler);
    })
    .catch((err) => {
      res.status(404).send(err);
    });
});

app.post("/start", bodyParser.json({limit: "100mb"}), function(req, res){
    var req = new Request(JSON.stringify(req.body), e);

    var handler = function(err, request){
      if(err){
        res.status(500).send(err);
      } else {
        res.status(200).send(request[1]);
      }
    }
    e.emit("request-start", req, handler, true);
});

app.post("/start/:id", bodyParser.json({limit: "100mb"}), function(req, res){
  var id = req.params.id;
  downloadStartingPoint(id)
    .then(function(path){
      var req = require(path).createRequest(req.body);
      delete require.cache[path];
      var handler = function(err, request){
        if(err){
          res.status(500).send(err);
        } else {
          res.status(200).send(request[1]);
        }
      }

      e.emit("request-start", req, handler);
    })
    .catch((err) => {
      res.status(404).send(err);
    });
});


app.get("/purge", function(req, res){
  e.emit("purge");
  res.status(200).end();
});

app.get("/log", function(req, res){
  fs.createReadStream('logs/' + (process.env.LOG_FILE || "app.log")).pipe(res);
});

app.listen(process.env.NODE_PORT || 3030);
