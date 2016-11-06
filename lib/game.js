var util     = require('util')
var http     = require('http')
var path     = require('path')
var ecstatic = require('ecstatic')
var io       = require('socket.io')
var express  = require('express');
var fs       = require('fs');

var Player = require('./Player')

/* ************************************************
** GAME INITIALISATION
************************************************ */

/**
 *  Define the application.
 */
var MonsterDefiler = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };

        /**
        *  Game Variables
        */
        self.socket;  // Socket Controller
        self.players; // Array of connected players

    };


    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        /*if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./index.html');
        */
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };


    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */

    /**
     *  Create the routing table entries + handlers for the application.
     */
    self.createRoutes = function() {
        self.routes = { };

        self.routes['/asciimo'] = function(req, res) {
            var link = "http://i.imgur.com/kmbjB.png";
            res.send("<html><body><img src='" + link + "'></body></html>");
        };

        self.routes['/'] = function(req, res) {
            res.setHeader('Content-Type', 'text/html');
            res.send(self.cache_get('index.html') );
        };
    };


    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express.createServer();

        //  Add handlers for the app (from the routes).
        for (var r in self.routes) {
            self.app.get(r, self.routes[r]);
        }
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
            gameInit();
        });
    };

    /* ************************************************
    ** GAME EVENT HANDLERS
    ************************************************ */
    self.gameInit = function () {
      // Create an empty array to store players
      self.players = []
    
      // Attach Socket.IO to server
      self.socket = io.listen(self.app)
      //Initialize game
      self.setEventHandlers();
    
    }
    
    self.setEventHandlers = function () {
      // Socket.IO
      self.socket.sockets.on('connection', onSocketConnection)
    }
    
    // New socket connection
    self.onSocketConnection = function (client) {
      util.log('New player has connected: ' + client.id)
    
      // Listen for client disconnected
      client.on('disconnect', onClientDisconnect)
    
      // Listen for new player message
      client.on('new player', onNewPlayer)
    
      // Listen for move player message
      client.on('move player', onMovePlayer)
    }
    
    // Socket client has disconnected
    self.onClientDisconnect = function () {
      util.log('Player has disconnected: ' + this.id)
    
      var removePlayer = playerById(this.id)
    
      // Player not found
      if (!removePlayer) {
        util.log('Player not found: ' + this.id)
        return
      }
    
      // Remove player from players array
      self.players.splice(self.players.indexOf(removePlayer), 1)
    
      // Broadcast removed player to connected socket clients
      this.broadcast.emit('remove player', {id: this.id})
    }
    
    // New player has joined
    self.onNewPlayer = function (data) {
      // Create a new player
      var newPlayer = new Player(data.x, data.y, data.angle)
      newPlayer.id = this.id
    
      // Broadcast new player to connected socket clients
      this.broadcast.emit('new player', {id: newPlayer.id, x: newPlayer.getX(), y: newPlayer.getY(), angle: newPlayer.getAngle()})
    
      // Send existing players to the new player
      var i, existingPlayer
      for (i = 0; i < self.players.length; i++) {
        existingPlayer = self.players[i]
        this.emit('new player', {id: existingPlayer.id, x: existingPlayer.getX(), y: existingPlayer.getY(), angle: existingPlayer.getAngle()})
      }
    
      // Add new player to the players array
      self.players.push(newPlayer)
    }
    
    // Player has moved
    self.onMovePlayer = function (data) {
      // Find player in array
      var movePlayer = playerById(this.id)
    
      // Player not found
      if (!movePlayer) {
        util.log('Player not found: ' + this.id)
        return
      }
    
      // Update player position
      movePlayer.setX(data.x)
      movePlayer.setY(data.y)
      movePlayer.setAngle(data.angle)
    
      // Broadcast updated position to connected socket clients
      this.broadcast.emit('move player', {id: movePlayer.id, x: movePlayer.getX(), y: movePlayer.getY(), angle: movePlayer.getAngle()})
    }
    
    /* ************************************************
    ** GAME HELPER FUNCTIONS
    ************************************************ */
    // Find player by ID
    self.playerById = function (id) {
      var i
      for (i = 0; i < self.players.length; i++) {
        if (self.players[i].id === id) {
          return self.players[i]
        }
      }
    
      return false
    }

};  



/**
 *  main():  Main code.
 */
var zapp = new MonsterDefiler();
zapp.initialize();
zapp.start();


/*Create and start the http server
var server = http.createServer(
  ecstatic({ root: path.resolve(__dirname, '../public') })
).listen(port, function (err) {
  if (err) {
    throw err
  }

  init()
})*/


