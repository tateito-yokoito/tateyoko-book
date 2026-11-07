import React from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from './LandingPage.jsx';
import './index.css';
import './hp-nov8-hero-preview.css';
import './hp-pc-balance.css';

createRoot(document.getElementById('root')).render(<LandingPage reviewOnly />);
