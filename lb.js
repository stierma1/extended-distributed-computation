"use strict"
var express = require("express");
var Bluebird = require("bluebird");
var bodyParser = require("body-parser");
var request = require("request");

var app = express();
var urls = {};
var num = 0;

app.get("/start/:id", function(req, res){
  var id = req.params.id;
  var idx = Math.floor((Math.random() * num));
  for(var i in urls){
    if(idx === 0){
      request.get(i + "/start/" + id, (err, h_req, body) => {
        res.send(body);
      });
      return;
    }
    idx--;
  }
});

app.post("/start", bodyParser.raw({limit: "100mb", type:"*/*"}), function(req, res){
  var idx = Math.floor((Math.random() * num));
  for(var i in urls){
    if(idx === 0){
      request.post({url:i + "/start", body:req.body, headers: req.headers}, (err, h_req, body) => {
        if(err){
          res.status(500).send(err);
          return;
        }
        res.status(200).send(body);
      });
      return;
    }
    idx--;
  }
});

app.post("/advertise", bodyParser.json(), function(req, res){
  if(!urls[req.body.url]){
    num++;
    urls[req.body.url] = true;
  }
  res.status(200).end();
});

app.timeout = 120000;
app.listen(process.env.NODE_PORT || 3031);
