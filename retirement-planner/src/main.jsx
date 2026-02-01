import React from 'react'
import ReactDOM from 'react-dom/client'
import RetirementTaxPlanner from './RetirementTaxPlanner.jsx'
import './index.css'

// Mock storage API for local development (since we're not in a browser extension)
window.storage = {
  get: async (key) => {
    const value = localStorage.getItem(key);
    return value ? { value } : null;
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RetirementTaxPlanner />
  </React.StrictMode>,
)
