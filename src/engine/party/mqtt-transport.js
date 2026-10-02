import Paho from 'paho-mqtt';

const Client = Paho.Client || Paho.default?.Client;
const Message = Paho.Message || Paho.default?.Message;

const BROKERS = [
  { host: 'broker.emqx.io', port: 8084, path: '/mqtt', name: 'EMQX Public' },
  { host: 'broker.hivemq.com', port: 8884, path: '/mqtt', name: 'HiveMQ Public' }
];

export class MqttPartyTransport {
  constructor({ isHost = false } = {}) {
    this.isHost = Boolean(isHost);
    this.client = null;
    this.room = null;
    this.connected = false;
    this.listeners = new Map();
    this.currentBrokerIndex = 0;
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

  async connect(roomCode, forceHost = null) {
    if (forceHost !== null) {
      this.isHost = Boolean(forceHost);
    }
    this.room = String(roomCode || '').toUpperCase().trim();
    if (!this.room) {
      throw new Error('Room code is required to connect to party transport');
    }

    return this._connectWithFallback(0);
  }

  _connectWithFallback(brokerIndex) {
    if (brokerIndex >= BROKERS.length) {
      return Promise.reject(new Error('Failed to connect to all available MQTT party brokers'));
    }

    const broker = BROKERS[brokerIndex];
    this.currentBrokerIndex = brokerIndex;
    const clientId = `micup_${this.isHost ? 'host' : 'guest'}_${Math.random().toString(36).substring(2, 10)}`;

    return new Promise((resolve, reject) => {
      if (!Client) {
        return reject(new Error('Paho MQTT Client is not available'));
      }

      const client = new Client(broker.host, broker.port, broker.path, clientId);

      client.onConnectionLost = (responseObject) => {
        this.connected = false;
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
          } catch (e) {
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
          this.client = client;
          this.connected = true;

          // Subscribe to our designated channel
          client.subscribe(this.mySubscribeTopic, {
            qos: 0,
            onSuccess: () => {
              this.emit('connected');
              resolve();
            },
            onFailure: (subErr) => {
              console.warn(`MQTT subscription failed for ${this.mySubscribeTopic}:`, subErr);
              // Still consider connected since connection was successful
              this.emit('connected');
              resolve();
            }
          });
        },
        onFailure: (err) => {
          console.warn(`MQTT connection failed to ${broker.name}, attempting next broker...`, err?.errorMessage || err);
          this._connectWithFallback(brokerIndex + 1)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  send(data) {
    if (!this.connected || !this.client) {
      console.warn('Cannot send MQTT message: transport not connected');
      return;
    }

    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      const msg = new Message(payload);
      msg.destinationName = this.myPublishTopic;
      msg.qos = 0;
      this.client.send(msg);
    } catch (err) {
      console.error('Error sending MQTT message:', err);
    }
  }

  disconnect() {
    this.connected = false;
    if (this.client) {
      try {
        if (this.client.isConnected && this.client.isConnected()) {
          this.client.disconnect();
        }
      } catch (e) {}
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
