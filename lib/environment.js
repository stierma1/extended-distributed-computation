"use strict"

var Environment = require("basic-distributed-computation").Environment;
var spawn = require("child_process").spawn;
var Bluebird = require("bluebird");
var _path = require("path");

class AppEnvironment extends Environment {
  constructor(config, correlationManager) {
    super(config, [_path.join(__dirname,"./application")], config.workerList || []);
    this.correlationManager = correlationManager;
    this.on("purge", () => {
      this.purge();
    });
  }

  advertise(){

  }

  receivedAdvertisement(){

  }

  sendToWorker(path, req){
    var worker = this.getWorker(path);
    if(worker){
      req.parent = worker;
      req.next();
    } else {
      this.downloadWorker(path)
        .then(((req) => {
          return (worker) => {
            req.parent = worker;
            req.next();
          };
        })(req))
        .catch(((req) => {
          return (err) => {
            req.choreIdx = -1;
            req.status(err).next();
          }
        })(req))
    }

  }

  sendToApplicationManager(origination, req){
    req.parent = this.applications[0];
    req.next();
  }

  requestEnd(req){
    this.correlationManager.emit("request-end", req);
  }

  requestStart(req){
    req.choreIdx--;
    req.parent = this.applications[0];
    req.next();
  }

  getWorker(path){
    for(var i = 0; i < this._workerRoutes.length; i++){
      var route = this._workerRoutes[i];
      if(route.path.test(path)){
        return route.worker;
      }
    }
    return null;
  }

  downloadWorker(path) {
    var defer = Bluebird.defer();
    var proc = spawn("npm", ["install", "edc-" + path], {cwd:_path.join(__dirname, "../")});
    proc.on("close", (code) => {
      if(code === 0){
        defer.resolve();
      } else {
        defer.reject("npm install edc-" + path + " received status code: " +  code);
      }
    });

    var prom = defer.promise;

    return prom.then(() => {
      var route = {
        path:new RegExp(path),
        originalPath: path,
        worker: new (require("edc-" + path))(this)
      };
      this._workerRoutes.push(route);
      return route.worker;
    })
  }

  purge(){
    for(var i = 0; i < this._workerRoutes.length; i++){
      var route = this._workerRoutes[i];
      var requirePath = "edc-" + route.originalPath;
      delete require.cache[requirePath];
    }
    this._workerRoutes = [];
  }

}

module.exports = AppEnvironment;
