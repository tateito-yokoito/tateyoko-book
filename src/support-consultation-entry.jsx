import React from 'react';
import { createRoot } from 'react-dom/client';
import SupportConsultationPage from './SupportConsultationPage.jsx';
import { canonicalPurchaseUrl } from './lib/canonicalPurchaseUrl.js';
import './support-consultation.css';

const canonicalUrl = canonicalPurchaseUrl(window.location);
if (canonicalUrl) window.location.replace(canonicalUrl);
else createRoot(document.getElementById('root')).render(<SupportConsultationPage />);
