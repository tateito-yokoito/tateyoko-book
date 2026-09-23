import React from 'react';
import {createRoot} from 'react-dom/client';
import {Scene_BookBuilder} from '../../src/App.jsx';
const user={id:'account'},project={id:'project',access_status:'paid'};
createRoot(document.getElementById('root')).render(<Scene_BookBuilder
 user={user} project={project} bookProjectId="project" initialStepIndex={4}
 purchaseStatus="checkout_opened"
 onReopenCheckout={()=>{window.calls.push({type:'stale-checkout'});}}
 onPurchase={async options=>{window.calls.push({type:'purchase',candidate:options.completionCandidateId});if(window.finishPayment)window.candidate.state='completed';return true;}}
 onBack={()=>{window.calls.push({type:'back'});}}
/>);
