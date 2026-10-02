import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MqttPartyTransport } from './mqtt-transport.js';

describe('MqttPartyTransport', () => {
  it('constructs with host or client flag and sets topics correctly', () => {
    const hostTransport = new MqttPartyTransport({ isHost: true });
    hostTransport.room = 'PARTY1';
    assert.equal(hostTransport.isHost, true);
    assert.equal(hostTransport.inboundTopic, 'micup/party/PARTY1/inbound');
    assert.equal(hostTransport.outboundTopic, 'micup/party/PARTY1/outbound');
    assert.equal(hostTransport.mySubscribeTopic, 'micup/party/PARTY1/inbound');
    assert.equal(hostTransport.myPublishTopic, 'micup/party/PARTY1/outbound');

    const guestTransport = new MqttPartyTransport({ isHost: false });
    guestTransport.room = 'PARTY1';
    assert.equal(guestTransport.isHost, false);
    assert.equal(guestTransport.mySubscribeTopic, 'micup/party/PARTY1/outbound');
    assert.equal(guestTransport.myPublishTopic, 'micup/party/PARTY1/inbound');
  });

  it('manages event listeners with on, off, emit', () => {
    const transport = new MqttPartyTransport();
    let received = null;
    const handler = (data) => { received = data; };

    transport.on('message', handler);
    transport.emit('message', { test: 123 });
    assert.deepEqual(received, { test: 123 });

    transport.off('message', handler);
    transport.emit('message', { test: 456 });
    assert.deepEqual(received, { test: 123 }); // unchanged
  });

  it('validates room code when connecting', async () => {
    const transport = new MqttPartyTransport();
    await assert.rejects(async () => {
      await transport.connect('');
    }, /Room code is required/);
  });
});
