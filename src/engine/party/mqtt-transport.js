import Paho from 'paho-mqtt';

const Client = Paho.Client || Paho.default?.Client || (typeof window !== 'undefined' && window.Paho?.Client);
const Message = Paho.Message || Paho.default?.Message || (typeof window !== 'undefined' && window.Paho?.Message);

export const BROKERS = Object.freeze({
  hivemq: {
    id: 'hivemq',
    host: 'broker.hivemq.com',
    port: 8884,
    path: '/mqtt',
    name: 'HiveMQ Public (WSS)'
  },
  emqx: {
    id: 'emqx',
    host: 'broker.emqx.io',
    port: 8084,
    path: '/mqtt',
    name: 'EMQX Public (WSS)'
  }
});

export const DEFAULT_BROKER = 'hivemq';

export class MqttPartyTransport {
  constructor({ isHost = false, brokerId = DEFAULT_BROKER } = {}) {
    this.isHost = Boolean(isHost);
    this.brokerId = BROKERS[brokerId] ? brokerId : DEFAULT_BROKER;
    this.client = null;
    this.room = null;
    this.connected = false;
    this.subscribed = false;
    this.listeners = new Map();
    this.connectPromise = null;
  }

  get inboundTopic() {
    return `micup/party/${this.room}/inbound`;
  }

  get outboundTopic() {
    return `micup/party/${this.room}/outbound`;
  }

  get mySubscribeTopic() {
    return this.isHost ? this.inboundTopic : this.outboundTopic;
  }

  get myPublishTopic() {
    return this.isHost ? this.outboundTopic : this.inboundTopic;
  }

  /**
   * Connect to specified room on the designated broker.
   * Both host and guests for a given room must use the same broker.
   */
  async connect(roomCode, { brokerId = null, forceHost = null } = {}) {
    if (forceHost !== null) {
      this.isHost = Boolean(forceHost);
    }
    if (brokerId && BROKERS[brokerId]) {
      this.brokerId = brokerId;
    }
    this.room = String(roomCode || '').toUpperCase().trim();
    if (!this.room) {
      throw new Error('Room code is required to connect to party transport');
    }

    if (this.connected && this.client) {
      return;
    }

    const broker = BROKERS[this.brokerId] || BROKERS[DEFAULT_BROKER];
    const clientId = `micup_${this.isHost ? 'host' : 'guest'}_${Math.random().toString(36).substring(2, 10)}`;

    return new Promise((resolve, reject) => {
      if (!Client) {
        return reject(new Error('Paho MQTT Client is not available'));
      }

      let hasSettled = false;
      let subscribeTimeoutId = null;

      const client = new Client(broker.host, broker.port, broker.path, clientId);

      client.onConnectionLost = (responseObject) => {
        this.connected = false;
        this.subscribed = false;
        if (responseObject?.errorCode !== 0) {
          console.warn(`MQTT connection lost on ${broker.name}:`, responseObject?.errorMessage);
        }
        this.emit('disconnected');
      };

      client.onMessageArrived = (msg) => {
        try {
          const payloadStr = msg.payloadString;
          let parsed;
          try {
            parsed = JSON.parse(payloadStr);
          } catch {
            parsed = payloadStr;
          }
          this.emit('message', parsed);
        } catch (err) {
          console.error('Error handling MQTT inbound message:', err);
        }
      };

      client.connect({
        useSSL: true,
        timeout: 6,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          // Subscribe with guaranteed QoS 1 and timeout
          subscribeTimeoutId = setTimeout(() => {
            if (!hasSettled) {
              hasSettled = true;
              console.warn(`MQTT subscription timed out on ${broker.name}`);
              this.disconnect();
              reject(new Error(`MQTT subscription timed out on ${broker.name}`));
            }
          }, 5000);

          client.subscribe(this.mySubscribeTopic, {
            qos: 1,
            onSuccess: () => {
              if (subscribeTimeoutId) clearTimeout(subscribeTimeoutId);
              if (hasSettled) return;
              hasSettled = true;

              this.client = client;
              this.connected = true;
              this.subscribed = true;
              this.emit('subscribed');
              this.emit('connected');
              resolve();
            },
            onFailure: (subErr) => {
              if (subscribeTimeoutId) clearTimeout(subscribeTimeoutId);
              if (hasSettled) return;
              hasSettled = true;

              console.error(`MQTT subscription failed for ${this.mySubscribeTopic}:`, subErr);
              this.disconnect();
              reject(new Error(subErr?.errorMessage || 'MQTT subscription failed'));
            }
          });
        },
        onFailure: (err) => {
          if (subscribeTimeoutId) clearTimeout(subscribeTimeoutId);
          if (hasSettled) return;
          hasSettled = true;

          console.warn(`MQTT connection failed to ${broker.name}:`, err?.errorMessage || err);
          this.connected = false;
          this.subscribed = false;
          reject(new Error(err?.errorMessage || `Connection failed to ${broker.name}`));
        }
      });
    });
  }

  send(data, qos = 1) {
    if (!this.connected || !this.client) {
      console.warn('Cannot send MQTT message: transport not connected');
      return false;
    }

    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      const msg = new Message(payload);
      msg.destinationName = this.myPublishTopic;
      msg.qos = qos;
      this.client.send(msg);
      return true;
    } catch (err) {
      console.error('Error sending MQTT message:', err);
      return false;
    }
  }

  disconnect() {
    this.connected = false;
    this.subscribed = false;
    if (this.client) {
      try {
        if (this.client.isConnected && this.client.isConnected()) {
          this.client.disconnect();
        }
      } catch {}
      this.client = null;
    }
    this.emit('disconnected');
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(data);
        } catch (err) {
          console.error(`Error in MQTT transport listener for "${event}":`, err);
        }
      }
    }
  }
}
