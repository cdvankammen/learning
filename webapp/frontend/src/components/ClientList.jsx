import React, { useEffect, useState } from 'react'
import { useToast } from './ToastProvider'

export default function ClientList({ clients, socket, socketStatus }) {
  const [feedback, setFeedback] = useState(null)
  const { notify } = useToast()

  useEffect(() => {
    if (!socket) return undefined

    function handleAck(payload) {
      if (!payload) return
      setFeedback(payload.ok ? `Command ${payload.cmd} acknowledged` : `Command ${payload.cmd} failed`)
    }

    socket.on('command_ack', handleAck)
    return () => socket.off('command_ack', handleAck)
  }, [socket])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    if (feedback) notify(feedback, 'info')
  }, [feedback, notify])

  function sendCommand(id, cmd){
    if (socketStatus !== 'connected' || !socket) {
      setFeedback('Live client control is unavailable until the socket backend connects.')
      return
    }
    setFeedback(`Sent ${cmd} to ${id}`)
    socket.emit('command', {id, cmd})
  }

  return (
    <div className="client-list">
      <div className="card">
        <h3>Socket Control</h3>
        <p>Connection status: <strong>{socketStatus}</strong></p>
        {feedback && <p className="alert info">{feedback}</p>}
      </div>
      {clients.length===0 && <div>No clients connected</div>}
      <ul>
        {clients.map(c=> (
          <li key={c.id}>
            <strong>{c.name}</strong> ({c.id}) - {c.status}
            <div>
              <button disabled={socketStatus !== 'connected'} onClick={()=>sendCommand(c.id, 'ping')}>Ping</button>
              <button disabled={socketStatus !== 'connected'} onClick={()=>sendCommand(c.id, 'start-video')}>Start Video</button>
              <button disabled={socketStatus !== 'connected'} onClick={()=>sendCommand(c.id, 'stop-video')}>Stop Video</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
