"use strict"
var ApplicationManager = require("basic-distributed-computation").ApplicationManager;
var winston = require("winston");
var clone = require("clone");
var isDebug = process.env.DEBUG;
var maxDepth = 500;

class BasicManager extends ApplicationManager{
  constructor(parent){
    super({}, parent);
  }

  checkStatus(req){

    if(req.currentIdx >= req.paths.length || req.statusCode !== 0 || req.depth >= maxDepth){
      if(req.depth >= maxDepth){
        req.statusCode = "Max Depth Exceeded";
      }

      var status = (req.statusCode === 0 && "success") || "error";
      winston.log("info", "completed", {uuid: req.uuid, predecessor: req.predecessorUuid, status:status, $time:Date.now()});
      this.parent.emit("request-end", req);

    } else {
      winston.log("info", "next", {uuid: req.uuid, predecessor: req.predecessorUuid, next:req.paths[req.currentIdx], $time:Date.now()});
      if(isDebug){
        req.history = req.history || [];
        req.history.push(clone(req.body, true));
        winston.log("debug", "history", {uuid: req.uuid, predecessor: req.predecessorUuid, history:req.history, $time:Date.now()});
      }

      req.next();
    }
  }
}

module.exports = BasicManager;
