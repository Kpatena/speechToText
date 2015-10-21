/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Module dependencies
var express    = require('express'),
  favicon      = require('serve-favicon'),
  errorhandler = require('errorhandler'),
  bodyParser   = require('body-parser'),
  csrf         = require('csurf'),
  cookieParser = require('cookie-parser');
var path = require('path');

module.exports = function (app) {
  app.set('view engine', 'ejs');
  app.enable('trust proxy');

  // use only https
  var env = process.env.NODE_ENV || 'development';
  if ('production' === env) {
    app.use(errorhandler());
  }

  // Configure Express
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  // Setup static public directory
  app.use(express.static(__dirname + '/../public'));
  app.use(favicon(__dirname + '/../public/images/favicon.ico'));

  // cookies
  var secret = Math.random().toString(36).substring(7);
  app.use(cookieParser(secret));

  // csrf
  var csrfProtection = csrf({ cookie: true });
  app.get('/', csrfProtection, function(req, res) {
    res.render('index', { ct: req.csrfToken() });
  });

  app.get('/editor', csrfProtection, function(req, res) {
    res.render('editor', { ct: req.csrfToken() });
  });
  // apply to all requests that begin with /api/
  // csfr token
  app.use('/api/', csrfProtection);
  
  app.use('/static', express.static(path.join(process.cwd(), 'bower_components')));


  //using conversation page as the main page 
  app.post('/', function(req, res) {

    console.log(req.body);

     var mongodb      = require ('mongodb');

    //We need to work with "MongoClient" interface in order to connect to a mongodb server.
    var MongoClient = mongodb.MongoClient;

    // Connection URL. This is where your mongodb server is running.
    var url = 'mongodb://kpatena:kyle081186@ds037283.mongolab.com:37283/speechtotext';

    // Use connect method to connect to the Server
    MongoClient.connect(url, function (err, db) {
      if (err) {
        console.log('Unable to connect to the mongoDB server. Error:', err);
      } else {
        //HURRAY!! We are connected. :)
        console.log('Connection established to', url);

        // Get the documents collection
        var collection = db.collection('conversations');

        //Create some users
        // var user1 = {name: 'modulus admin', age: 42, roles: ['admin', 'moderator', 'user']};
        // var user2 = {name: 'modulus user', age: 22, roles: ['user']};
        // var user3 = {name: 'modulus super admin', age: 92, roles: ['super-admin', 'admin', 'moderator', 'user']};

        var conversation = {post: req.body};
        
        // Insert some users
        collection.insert([conversation], function (err, result) {
          if (err) {
            console.log(err);
          } else {
            console.log('Inserted %d documents into the "users" collection. The documents inserted with "_id" are:', result.length, result);
          }
          //Close connection
          db.close();
        });
      }
    });
  res.send('sentToDatabase');
});
};
