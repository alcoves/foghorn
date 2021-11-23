const cors = require('cors')
const http = require('http');
const webrtc = require("wrtc");
const express = require('express');

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const rtcOptions = { iceServers: [{ urls: "stun:stun.stunprotocol.org" }] }

const users = {}

// setInterval(() =>{
//   console.log(users)
// }, 5000)

app.use(cors("*"))

function addUserToRoom(roomId, user, stream) {
  const addition = {
    id: user.id,
    feed: stream,
    username: user.username
  }

  if (!users[roomId]) return users[roomId] = [addition]
  if (users[roomId].filter(u => u.id === user.id).length > 0) {
    // User already existed, replace user
    return users[roomId] = users[roomId].map(u => u.id !== addition.id ? u : addition);
  }
  users[roomId].push(addition)
}

function removeUserFromRoom(roomId, user) {
  if (!users[roomId] || !users[roomId].length) return
  users[roomId] = users[roomId].filter(e => e.id !== user.id);
}

async function consume(roomId, _user, sdp) {
  const peer = new webrtc.RTCPeerConnection(rtcOptions);
  const desc = new webrtc.RTCSessionDescription(sdp);
  await peer.setRemoteDescription(desc);
  users[roomId].forEach((user) => {
    if (user.id === _user.id) {
      console.log('skipping tracks because user is self')
      return
    }
    user.feed.getTracks().forEach(track => {
      console.log("track", track)
      peer.addTrack(track, user.feed)
    });
  })
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  return peer.localDescription
}

// async function broadcast(roomId, user, sdp) {
//   const peer = new webrtc.RTCPeerConnection(rtcOptions);
//   peer.ontrack = (e) => addUserToRoom(roomId, user, e.streams[0])
//   const desc = new webrtc.RTCSessionDescription(sdp);
//   await peer.setRemoteDescription(desc);
//   const answer = await peer.createAnswer();
//   await peer.setLocalDescription(answer);
//   return peer.localDescription
// }

io.on('connection', (socket) => {
  console.log("user connected", socket.id)

  let broadPeer, broadDesc
  let consumePeer, consumeDesc

  socket.on('disconnect', () => {
    if (broadPeer && broadPeer.close) broadPeer.close()
    if (broadDesc && broadDesc.close) broadDesc.close()
    if (consumePeer && consumePeer.close) consumePeer.close()
    if (consumeDesc && consumeDesc.close) consumeDesc.close()
    console.log('user disconnected');
  });

  socket.on("join", async (roomId, user, sdp) => {
    console.log(`${user.username} connected to ${roomId}`);
    socket.join(roomId);

    broadPeer = new webrtc.RTCPeerConnection(rtcOptions);
    broadPeer.ontrack = (e) => addUserToRoom(roomId, user, e.streams[0])
    broadDesc = new webrtc.RTCSessionDescription(sdp);

    await broadPeer.setRemoteDescription(broadDesc);
    const answer = await broadPeer.createAnswer();
    await broadPeer.setLocalDescription(answer);

    socket.emit('broadcast-response', broadPeer.localDescription)
    io.to(roomId).emit("users", users[roomId]);
  });

  socket.on("consume", async (roomId, user, sdp) => {
    console.log("socket broadcast", roomId, user)

    consumePeer = new webrtc.RTCPeerConnection(rtcOptions);
    consumeDesc = new webrtc.RTCSessionDescription(sdp);

    await consumePeer.setRemoteDescription(consumeDesc);
    users[roomId].forEach((_user) => {
      if (_user.id === user.id) {
        console.log('skipping tracks because user is self')
        return
      }
      console.log(`sending stream from ${_user.username} to ${_user.username}`)
      _user.feed.getTracks().forEach(track => {
        console.log("track", track)
        consumePeer.addTrack(track, _user.feed)
      });
    })

    const answer = await consumePeer.createAnswer();
    await consumePeer.setLocalDescription(answer);
    socket.emit('consume-response', consumePeer.localDescription)
  });

  socket.on("leave", (roomId, user) => {
    if (broadPeer && broadPeer.close) broadPeer.close()
    if (broadDesc && broadDesc.close) broadDesc.close()
    if (consumePeer && consumePeer.close) consumePeer.close()
    if (consumeDesc && consumeDesc.close) consumeDesc.close()

    removeUserFromRoom(roomId, user)
    socket.to(roomId).emit("users", users[roomId]);
    io.to(roomId).emit("users", users[roomId]);
    socket.leave(roomId)
  })
});


server.listen(3200, () => console.log('server started on 3200'));

// const cors = require('cors')
// const http = require('http');
// const webrtc = require("wrtc");
// const express = require('express');

// const app = express();
// const server = http.createServer(app);
// const { Server } = require("socket.io");

// const io = new Server(server, {
//   cors: {
//     origin: '*'
//   }
// });

// const rtcOptions = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }

// const users = {}

// // setInterval(() =>{
// //   console.log(users)
// // }, 5000)

// app.use(cors("*"))

// function addUserToRoom(roomId, user, stream) {
//   const addition = {
//     id: user.id,
//     feed: stream,
//     username: user.username
//   }

//   if (!users[roomId]) return users[roomId] = [addition]
//   if (users[roomId].filter(u => u.id === user.id).length > 0) {
//     // User already existed, replace user
//     return users[roomId] = users[roomId].map(u => u.id !== addition.id ? u : addition);
//   }
//   users[roomId].push(addition)
// }

// function removeUserFromRoom(roomId, user) {
//   if (!users[roomId] || !users[roomId].length) return
//   users[roomId] = users[roomId].filter(e => e.id !== user.id);
// }

// async function consume(roomId, _user, sdp) {
//   const peer = new webrtc.RTCPeerConnection(rtcOptions);
//   const desc = new webrtc.RTCSessionDescription(sdp);
//   await peer.setRemoteDescription(desc);
//   users[roomId].forEach((user) => {
//     if (user.id === _user.id) {
//       console.log('skipping tracks because user is self')
//       return
//     }
//     user.feed.getTracks().forEach(track => {
//       console.log("track", track)
//       peer.addTrack(track, user.feed)
//     });
//   })
//   const answer = await peer.createAnswer();
//   await peer.setLocalDescription(answer);
//   return peer.localDescription
// }

// async function broadcast(roomId, user, sdp) {
//   const peer = new webrtc.RTCPeerConnection(rtcOptions);
//   peer.ontrack = (e) => addUserToRoom(roomId, user, e.streams[0])
//   const desc = new webrtc.RTCSessionDescription(sdp);
//   await peer.setRemoteDescription(desc);
//   const answer = await peer.createAnswer();
//   await peer.setLocalDescription(answer);
//   return peer.localDescription
// }

// io.on('connection', (socket) => {
//   console.log("user connected", socket.id)

//   socket.on('disconnect', () => {
//     console.log('user disconnected');
//   });

//   socket.on("join", async (roomId, user, sdp) => {
//     console.log(`${user.username} connected to ${roomId}`);
//     socket.join(roomId);
//     const sdpResponse = await broadcast(roomId, user, sdp)
//     socket.emit('broadcast-response', sdpResponse)
//     io.to(roomId).emit("users", users[roomId]);
//   });

//   socket.on("consume", async (roomId, user, sdp) => {
//     console.log("socket broadcast", roomId, user)
//     const sdpResponse = await consume(roomId, user, sdp)
//     socket.emit('consume-response', sdpResponse)
//   });

//   socket.on("leave", (roomId, user) => {
//     removeUserFromRoom(roomId, user)
//     socket.to(roomId).emit("users", users[roomId]);
//     io.to(roomId).emit("users", users[roomId]);
//     socket.leave(roomId)
//   })
// });


// server.listen(3200, () => console.log('server started on 5000'));