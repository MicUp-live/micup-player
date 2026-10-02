import { render } from 'preact';
import './index.css';
import { PartyApp } from './components/party/PartyApp.jsx';

const container = document.getElementById('party-app');
if (container) {
  render(<PartyApp />, container);
}
