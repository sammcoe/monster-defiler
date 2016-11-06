/* global Phaser RemotePlayer io */
var MonsterDefiler = MonsterDefiler || {};

MonsterDefiler.game = new Phaser.Game("100", "100", Phaser.AUTO, '', { preload: preload, create: create, update: update, render: render })

function preload () {
  MonsterDefiler.game.load.image('earth', 'assets/light_sand.png')
  MonsterDefiler.game.load.spritesheet('dude', 'assets/dude.png', 64, 64)
  MonsterDefiler.game.load.spritesheet('enemy', 'assets/dude.png', 64, 64)
}

var socket // Socket connection

var land

var player

var enemies

var currentSpeed = 0
var cursors

function create () {
  socket = io.connect()

  // Resize our game world to be a 2000 x 2000 square
  MonsterDefiler.game.world.setBounds(-500, -500, 4000, 400)

  // Our tiled scrolling background
  land = MonsterDefiler.game.add.tileSprite(0, 0, 2000, 2000, 'earth')
  land.fixedToCamera = true

  // The base of our player
  var startX = Math.round(Math.random() * (1000) - 500)
  var startY = Math.round(Math.random() * (1000) - 500)
  player = MonsterDefiler.game.add.sprite(startX, startY, 'dude')
  player.anchor.setTo(0.5, 0.5)
  player.animations.add('move', [0, 1, 2, 3, 4, 5, 6, 7], 20, true)
  player.animations.add('stop', [3], 20, true)

  // This will force it to decelerate and limit its speed
  // player.body.drag.setTo(200, 200)
  MonsterDefiler.game.physics.enable(player, Phaser.Physics.ARCADE);
  player.body.maxVelocity.setTo(400, 400)
  player.body.collideWorldBounds = true

  // Create some baddies to waste :)
  enemies = []

  player.bringToTop()

  MonsterDefiler.game.camera.follow(player)
  MonsterDefiler.game.camera.deadzone = new Phaser.Rectangle(150, 150, 500, 500)
  MonsterDefiler.game.camera.focusOnXY(0, 0)

  cursors = MonsterDefiler.game.input.keyboard.createCursorKeys()

  // Start listening for events
  setEventHandlers()
}

var setEventHandlers = function () {
  // Socket connection successful
  socket.on('connect', onSocketConnected)

  // Socket disconnection
  socket.on('disconnect', onSocketDisconnect)

  // New player message received
  socket.on('new player', onNewPlayer)

  // Player move message received
  socket.on('move player', onMovePlayer)

  // Player removed message received
  socket.on('remove player', onRemovePlayer)
}

// Socket connected
function onSocketConnected () {
  console.log('Connected to socket server')

  // Reset enemies on reconnect
  enemies.forEach(function (enemy) {
    enemy.player.kill()
  })
  enemies = []

  // Send local player data to the game server
  socket.emit('new player', { x: player.x, y: player.y, angle: player.angle })
}

// Socket disconnected
function onSocketDisconnect () {
  console.log('Disconnected from socket server')
}

// New player
function onNewPlayer (data) {
  console.log('New player connected:', data.id)

  // Avoid possible duplicate players
  var duplicate = playerById(data.id)
  if (duplicate) {
    console.log('Duplicate player!')
    return
  }

  // Add new player to the remote players array
  enemies.push(new RemotePlayer(data.id, MonsterDefiler.game, player, data.x, data.y, data.angle))
}

// Move player
function onMovePlayer (data) {
  var movePlayer = playerById(data.id)

  // Player not found
  if (!movePlayer) {
    console.log('Player not found: ', data.id)
    return
  }

  // Update player position
  movePlayer.player.x = data.x
  movePlayer.player.y = data.y
  movePlayer.player.angle = data.angle
}

// Remove player
function onRemovePlayer (data) {
  var removePlayer = playerById(data.id)

  // Player not found
  if (!removePlayer) {
    console.log('Player not found: ', data.id)
    return
  }

  removePlayer.player.kill()

  // Remove player from array
  enemies.splice(enemies.indexOf(removePlayer), 1)
}

function update () {
  for (var i = 0; i < enemies.length; i++) {
    if (enemies[i].alive) {
      enemies[i].update()
      MonsterDefiler.game.physics.arcade.collide(player, enemies[i].player)
    }
  }

  if (cursors.left.isDown) {
    player.angle -= 4
  } else if (cursors.right.isDown) {
    player.angle += 4
  }

  if (cursors.up.isDown) {
    // The speed we'll travel at
    currentSpeed = 300
  } else {
    if (currentSpeed > 0) {
      currentSpeed -= 4
    }
  }

  MonsterDefiler.game.physics.arcade.velocityFromRotation(player.rotation, currentSpeed, player.body.velocity)

  if (currentSpeed > 0) {
    player.animations.play('move')
  } else {
    player.animations.play('stop')
  }

  land.tilePosition.x = -MonsterDefiler.game.camera.x
  land.tilePosition.y = -MonsterDefiler.game.camera.y

  if (MonsterDefiler.game.input.activePointer.isDown) {
    if (MonsterDefiler.game.physics.arcade.distanceToPointer(player) >= 10) {
      currentSpeed = 300

      player.rotation = MonsterDefiler.game.physics.arcade.angleToPointer(player)
    }
  }

  socket.emit('move player', { x: player.x, y: player.y, angle: player.angle })
}

function render () {

}

// Find player by ID
function playerById (id) {
  for (var i = 0; i < enemies.length; i++) {
    if (enemies[i].player.name === id) {
      return enemies[i]
    }
  }

  return false
}
