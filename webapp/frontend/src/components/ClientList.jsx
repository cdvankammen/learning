import React from 'react'
import PropTypes from 'prop-types'

export default function ClientList({clients, socket}){
  function sendCommand(id, cmd){
    if(!socket) return
    socket.emit('command', {id, cmd})
  }

  return (
    <div className="client-list">
      {clients.length===0 && <div>No clients connected</div>}
      <ul>
        {clients.map(c=> (
          <li key={c.id}>
            <strong>{c.name}</strong> ({c.id}) - {c.status}
            <div>
              <button onClick={()=>sendCommand(c.id, 'ping')}>Ping</button>
              <button onClick={()=>sendCommand(c.id, 'start-video')}>Start Video</button>
              <button onClick={()=>sendCommand(c.id, 'stop-video')}>Stop Video</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

ClientList.propTypes = {
  clients: PropTypes.array,
  socket: PropTypes.object
}

