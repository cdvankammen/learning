import React, { useEffect, useState, useCallback } from 'react'
import { fetchJson } from '../lib/http'
import { useToast } from '../components/ToastProvider'

function FieldInput({ fieldKey, schema, value, onChange }) {
  const { type, description } = schema
  if (type === 'boolean') {
    return (
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(fieldKey, e.target.checked)}
        />
        <span className="settings-field-desc">{description}</span>
      </label>
    )
  }
  return (
    <>
      <input
        type={type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        onChange={e => onChange(fieldKey, type === 'number' ? Number(e.target.value) : e.target.value)}
        className="settings-input"
      />
      <span className="settings-field-desc">{description}</span>
    </>
  )
}

export default function Settings({ socketStatus }) {
  const [snapshot, setSnapshot] = useState(null)
  const [schema, setSchema] = useState({})
  const [draft, setDraft] = useState({})
  const [configFile, setConfigFile] = useState('')
  const [errors, setErrors] = useState({})
  const [saveMsg, setSaveMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const { notify } = useToast()

  const load = useCallback(async () => {
    try {
      const data = await fetchJson('/api/settings')
      setSnapshot(data.settings)
      setSchema(data.schema || {})
      setDraft(data.settings || {})
      setConfigFile(data.configFile || '')
      setLoadError(null)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (loadError) notify(loadError, 'error')
  }, [loadError, notify])

  useEffect(() => {
    if (!saveMsg) return
    if (saveMsg.startsWith('✓')) {
      notify(saveMsg, 'success')
      return
    }
    if (saveMsg.startsWith('⚠')) {
      notify(saveMsg, 'warning')
      return
    }
    notify(saveMsg, 'info')
  }, [saveMsg, notify])

  function handleChange(key, val) {
    setDraft(prev => ({ ...prev, [key]: val }))
    setSaveMsg('')
  }

  async function handleValidate() {
    try {
      const result = await fetchJson('/api/settings/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      setErrors(result.errors || {})
      setSaveMsg(result.valid ? '✓ Validation passed' : '⚠ Validation errors found')
    } catch (err) {
      setSaveMsg(`Validate error: ${err.message}`)
    }
  }

  async function handleSave() {
    try {
      const result = await fetchJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      if (result.ok) {
        setSnapshot(result.saved)
        setErrors({})
        setSaveMsg(`✓ Saved to ${result.configFile}`)
      } else {
        setErrors(result.errors || {})
        setSaveMsg('⚠ Save failed — see errors above')
      }
    } catch (err) {
      setSaveMsg(`Save error: ${err.message}`)
    }
  }

  function handleReset() {
    if (snapshot) { setDraft({ ...snapshot }); setErrors({}); setSaveMsg('') }
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="card">
        <h3>Connection</h3>
        <p>Socket status: <strong>{socketStatus}</strong></p>
        {socketStatus !== 'connected' && (
          <p>The socket backend is not available — live client actions stay disabled.</p>
        )}
      </div>

      <div className="card">
        <h3>Configuration</h3>
        {loading && <p>Loading settings…</p>}
        {loadError && <p className="alert">Could not load settings: {loadError}</p>}
        {configFile && <p style={{ fontSize: '0.85em', color: '#888' }}>Config file: <code>{configFile}</code></p>}

        {!loading && Object.entries(schema).map(([key, s]) => (
          <div key={key} className="settings-row" style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontWeight: 600 }}>{key}</label>
            <FieldInput fieldKey={key} schema={s} value={draft[key]} onChange={handleChange} />
            {errors[key] && <span style={{ color: 'red', fontSize: '0.85em' }}>{errors[key]}</span>}
          </div>
        ))}

        {!loading && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleValidate} className="btn btn-secondary">Validate</button>
            <button onClick={handleSave} className="btn btn-primary">Save</button>
            <button onClick={handleReset} className="btn btn-secondary">Reset</button>
            {saveMsg && <span style={{ fontSize: '0.9em' }}>{saveMsg}</span>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Backup Policy (read-only)</h3>
        <ul>
          <li>Max backup age: 4 hours</li>
          <li>Prune retention: keep 10 per pattern</li>
          <li>Compression: lzo (default)</li>
        </ul>
      </div>

      <div className="card">
        <h3>About</h3>
        <p>USB/IP Management Console v0.1.0</p>
        <p>Manages Proxmox LXC containers and USB/IP device sharing.</p>
      </div>
    </div>
  )
}
