import { useState } from 'preact/hooks';
import { isCloudLinked, showCode, queue } from '../state/player-state.js';
import { cloudQueueClient } from '../engine/sync/cloud-queue-client.js';
import { libraryStore } from '../engine/library/library-store.js';

export function CloudSyncModal({ isOpen, onClose }) {
  const [eventId, setEventId] = useState(showCode.value);
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8080');
  const [statusMessage, setStatusMessage] = useState('');

  const handleConnect = () => {
    if (!eventId.trim()) {
      setStatusMessage('Please enter a valid Event ID or Show Code');
      return;
    }

    cloudQueueClient.apiBaseUrl = apiBaseUrl;
    showCode.value = eventId.toUpperCase().trim();

    cloudQueueClient.startPolling({
      eventId: eventId.trim(),
      libraryStore,
      onUpdate: (activeQueue) => {
        queue.value = activeQueue;
        isCloudLinked.value = true;
        setStatusMessage(`Connected! Syncing ${activeQueue.length} requests in live rotation.`);
      },
      onError: (err) => {
        setStatusMessage(`Connection note: Polling ${apiBaseUrl} (make sure MicUp backend is running)`);
      }
    });

    isCloudLinked.value = true;
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleDisconnect = () => {
    cloudQueueClient.stopPolling();
    isCloudLinked.value = false;
    setStatusMessage('Disconnected from cloud queue. Running in standalone local mode.');
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.8)',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="font-display" style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>
              LINK MICUP.LIVE SHOW
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Lean on MicUp.live's cloud engine for queue management & mobile requests.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-muted)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Input Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
              Event ID or Show Code
            </label>
            <input
              type="text"
              value={eventId}
              onInput={(e) => setEventId(e.target.value)}
              placeholder="e.g. OMALLEY or event-uuid"
              style={{
                width: '100%',
                height: '42px',
                background: 'rgba(9, 10, 15, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: '#fff',
                padding: '0 12px',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
              API Base URL
            </label>
            <input
              type="text"
              value={apiBaseUrl}
              onInput={(e) => setApiBaseUrl(e.target.value)}
              placeholder="http://localhost:8080 or https://api.micup.live"
              style={{
                width: '100%',
                height: '42px',
                background: 'rgba(9, 10, 15, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: '#fff',
                padding: '0 12px',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 42, 95, 0.1)',
            border: '1px solid rgba(255, 42, 95, 0.3)',
            color: '#fff',
            fontSize: '12px'
          }}>
            {statusMessage}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          {isCloudLinked.value && (
            <button
              onClick={handleDisconnect}
              style={{
                height: '38px',
                padding: '0 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--neon-coral)',
                fontSize: '13px',
                fontWeight: 700
              }}
            >
              Disconnect
            </button>
          )}

          <button
            onClick={handleConnect}
            style={{
              height: '38px',
              padding: '0 20px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--grad-hotmic)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(255, 42, 95, 0.4)'
            }}
          >
            {isCloudLinked.value ? 'Update Sync' : 'Link Show'}
          </button>
        </div>
      </div>
    </div>
  );
}
